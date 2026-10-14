import { describe, expect, it } from 'vitest';
import { writeFile, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { inside, inputPath, outputPath, safeId, readDocument } from '../../src/utils/files.js';
import { publicAddress, validateUrl } from '../../src/utils/download.js';
import { redact, errorData, AppError } from '../../src/errors/index.js';
import { csvCell } from '../../src/commands/batch.js';
import { temporary } from '../helpers.js';
import { retry } from '../../src/utils/retry.js';

describe('security boundaries', () => {
  it('rejects unsafe IDs, project traversal and existing outputs', async () => {
    const root = await temporary();
    expect(() => safeId('../secret')).toThrow();
    await expect(inside(root, '../secret')).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
    await writeFile(join(root, 'existing'), 'keep');
    await expect(outputPath(join(root, 'existing'))).rejects.toMatchObject({
      code: 'OUTPUT_EXISTS',
    });
    await expect(inputPath('https://example.com/a.mp4')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });
  });
  it.skipIf(process.platform === 'win32')(
    'rejects project symlinks escaping the root',
    async () => {
      const root = await temporary();
      const external = await temporary();
      await mkdir(join(root, 'assets'));
      await symlink(external, join(root, 'assets', 'external'));
      await expect(inside(root, 'assets/external/video.mp4')).rejects.toMatchObject({
        code: 'PATH_TRAVERSAL',
      });
    },
  );
  it('validates provider URLs and all common internal address ranges', () => {
    for (const url of [
      'http://api.openai.com/file',
      'https://api.openai.com:444/file',
      'https://user:secret@api.openai.com/file',
      'https://evil.com/file',
      'https://127.0.0.1/file',
    ])
      expect(() => validateUrl(url, ['api.openai.com'])).toThrow();
    expect(validateUrl('https://api.openai.com/file', ['api.openai.com']).hostname).toBe(
      'api.openai.com',
    );
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '192.168.1.2',
      '::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ])
      expect(publicAddress(address)).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true);
  });
  it('redacts credentials and prevents CSV formula injection', () => {
    expect(redact('sk-secretsecret Bearer abc')).not.toContain('secretsecret');
    expect(errorData(new AppError('TEST', 'Bearer secret')).message).toContain('[REDACTED]');
    expect(csvCell('=cmd()')).toBe('"\'=cmd()"');
  });
  it('rejects duplicate YAML keys and limits aliases', async () => {
    const root = await temporary();
    const file = join(root, 'input.yaml');
    await writeFile(file, 'subject: a\nsubject: b\n');
    await expect(readDocument(file)).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  });
  it('retries rate-limited reads but does not retry authentication errors', async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 429 };
        return 'ok';
      },
      { baseMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    calls = 0;
    await expect(
      retry(async () => {
        calls++;
        throw { status: 401 };
      }),
    ).rejects.toEqual({ status: 401 });
    expect(calls).toBe(1);
  });
});
