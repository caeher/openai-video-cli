import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { temporary, signal } from '../helpers.js';
const mocked = vi.hoisted(() => ({
  addresses: [{ address: '8.8.8.8', family: 4 }],
  status: 200,
  length: '4',
  body: 'test',
  type: 'video/mp4',
  lookupCalled: false,
}));
vi.mock('node:dns/promises', () => ({ lookup: async () => mocked.addresses }));
vi.mock('node:https', () => ({
  request: (_url: URL, opts: RequestOptions, callback: (message: IncomingMessage) => void) => {
    const emitter = new EventEmitter();
    const response = Readable.from([Buffer.from(mocked.body)]);
    Object.assign(response, {
      statusCode: mocked.status,
      headers: { 'content-length': mocked.length, 'content-type': mocked.type },
    });
    const pinned = opts.lookup;
    if (pinned) {
      mocked.lookupCalled = true;
    }
    return Object.assign(emitter, {
      end: () => queueMicrotask(() => callback(response as IncomingMessage)),
      destroy: () => undefined,
    });
  },
}));
import { download } from '../../src/utils/download.js';
const asset = {
  url: 'https://api.openai.com/download/test',
  allowedHosts: ['api.openai.com'],
  contentTypes: ['video/mp4'],
};
describe('verifiable downloads', () => {
  it('pins validated DNS, hashes and publishes complete data', async () => {
    const root = await temporary();
    const result = await download(asset, join(root, 'video.mp4'), signal());
    expect(result.bytes).toBe(4);
    expect(result.sha256).toHaveLength(64);
    expect(await readFile(result.output, 'utf8')).toBe('test');
    expect(mocked.lookupCalled).toBe(true);
  });
  it('rejects incomplete files and cleans partials', async () => {
    const root = await temporary();
    mocked.length = '12';
    try {
      await expect(download(asset, join(root, 'video.mp4'), signal())).rejects.toMatchObject({
        code: 'DOWNLOAD_INCOMPLETE',
      });
      expect(await readdir(root)).toEqual([]);
    } finally {
      mocked.length = '4';
    }
  });
  it('rejects mismatched checksums, redirects and content types', async () => {
    const root = await temporary();
    await expect(
      download({ ...asset, sha256: 'bad' }, join(root, 'x.mp4'), signal()),
    ).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    mocked.status = 302;
    try {
      await expect(download(asset, join(root, 'x.mp4'), signal())).rejects.toMatchObject({
        code: 'DOWNLOAD_RESPONSE',
      });
    } finally {
      mocked.status = 200;
    }
    mocked.type = 'text/html';
    try {
      await expect(download(asset, join(root, 'x.mp4'), signal())).rejects.toMatchObject({
        code: 'DOWNLOAD_RESPONSE',
      });
    } finally {
      mocked.type = 'video/mp4';
    }
    expect(await readdir(root)).toEqual([]);
  });
  it('rejects private DNS addresses before requesting', async () => {
    const root = await temporary();
    mocked.addresses = [{ address: '169.254.169.254', family: 4 }];
    try {
      await expect(download(asset, join(root, 'x.mp4'), signal())).rejects.toMatchObject({
        code: 'SSRF_BLOCKED',
      });
    } finally {
      mocked.addresses = [{ address: '8.8.8.8', family: 4 }];
    }
  });
});
