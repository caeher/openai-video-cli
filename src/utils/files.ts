import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { parseDocument } from 'yaml';
import { AppError } from '../errors/index.js';

export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id))
    throw new AppError(
      'UNSAFE_ID',
      'Invalid identifier.',
      'Use letters, numbers, underscores and hyphens.',
    );
  return id;
}

export async function inputPath(path: string, maxBytes = 512 * 1024 * 1024): Promise<string> {
  if (path.includes('\0') || /^[a-z]+:\/\//i.test(path))
    throw new AppError('UNSAFE_PATH', 'Only local file paths are accepted.');
  const file = await realpath(resolve(path));
  const info = await stat(file);
  if (!info.isFile() || info.size > maxBytes)
    throw new AppError(
      'FILE_LIMIT',
      'Input must be a regular file within the size limit.',
      `Maximum: ${maxBytes} bytes.`,
    );
  return file;
}

export async function outputPath(path: string, overwrite = false): Promise<string> {
  if (path.includes('\0') || /^[a-z]+:\/\//i.test(path))
    throw new AppError('UNSAFE_PATH', 'Only local file paths are accepted.');
  const file = resolve(path);
  await mkdir(dirname(file), { recursive: true });
  await access(dirname(file), constants.W_OK);
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile())
      throw new AppError('UNSAFE_PATH', 'Output cannot be a symlink or non-regular file.');
    if (!overwrite)
      throw new AppError(
        'OUTPUT_EXISTS',
        `Output already exists: ${file}`,
        'Choose another output path.',
      );
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
  }
  return file;
}

export async function inside(root: string, path: string): Promise<string> {
  const base = await realpath(root);
  const target = resolve(base, path);
  const rel = relative(base, target);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new AppError('PATH_TRAVERSAL', 'Project path escapes its root.');
  let existing = target;
  for (;;) {
    try {
      const canonical = await realpath(existing);
      const r = relative(base, canonical);
      if (r.startsWith('..') || isAbsolute(r))
        throw new AppError('PATH_TRAVERSAL', 'Project symlink escapes its root.');
      break;
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') existing = dirname(existing);
      else throw e;
    }
  }
  return target;
}

export async function atomicWrite(
  path: string,
  data: string | Uint8Array,
  overwrite = true,
): Promise<void> {
  const file = await outputPath(path, overwrite);
  const temp = join(dirname(file), `.${randomUUID()}.tmp`);
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    if (overwrite) await rename(temp, file);
    else {
      const { link } = await import('node:fs/promises');
      await link(temp, file);
    }
  } finally {
    await handle.close().catch(() => undefined);
    await rm(temp, { force: true });
  }
}

export async function readDocument(path: string): Promise<unknown> {
  const file = await inputPath(path, 8 * 1024 * 1024);
  const text = await readFile(file, 'utf8');
  if (['.yml', '.yaml'].includes(extname(file))) {
    const doc = parseDocument(text, { uniqueKeys: true });
    if (doc.errors.length)
      throw new AppError('INVALID_DOCUMENT', doc.errors[0]?.message ?? 'Invalid YAML.');
    return doc.toJS({ maxAliasCount: 20 }) as unknown;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError('INVALID_DOCUMENT', 'Invalid JSON.', 'Use JSON or a .yaml/.yml extension.');
  }
}

export async function writeJson(path: string, data: unknown, overwrite = true) {
  await atomicWrite(path, `${JSON.stringify(data, null, 2)}\n`, overwrite);
}
export async function fileHash(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(await inputPath(path, 2147483648)))
    hash.update(chunk as Buffer);
  return hash.digest('hex');
}
