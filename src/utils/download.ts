import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { createHash } from 'node:crypto';
import { open, rm, link } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { AppError } from '../errors/index.js';
import { outputPath } from './files.js';
import type { DownloadAsset } from '../providers/types.js';

export function publicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const ip = ipaddr.process(address);
  return ip.range() === 'unicast';
}
export function validateUrl(raw: string, allowedHosts: string[]) {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !allowedHosts.includes(url.hostname) ||
    ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, ''))
  )
    throw new AppError('UNSAFE_URL', 'Download URL is not an allowed HTTPS provider host.');
  return url;
}

/** Pins DNS to a validated public IP. Redirects and URL credentials are rejected. */
export async function download(
  asset: DownloadAsset,
  output: string,
  signal: AbortSignal,
  maxBytes = 536870912,
  onProgress?: (bytes: number, total?: number) => void,
) {
  const url = validateUrl(asset.url, asset.allowedHosts);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new AppError('SSRF_BLOCKED', 'Download hostname resolves to a non-public address.');
  const address = addresses[0]!;
  const file = await outputPath(output);
  const temp = join(dirname(file), `.${randomUUID()}.part`);
  const handle = await open(temp, 'wx', 0o600);
  try {
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const req = httpsRequest(
        url,
        {
          signal,
          lookup: (_host, _opts, cb) => cb(null, address.address, address.family),
          timeout: 30000,
        },
        resolve,
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new AppError('DOWNLOAD_TIMEOUT', 'Download stalled.')));
      req.end();
    });
    const type = response.headers['content-type']?.split(';')[0];
    if (response.statusCode !== 200 || !type || !asset.contentTypes.includes(type)) {
      response.destroy();
      throw Object.assign(
        new AppError('DOWNLOAD_RESPONSE', 'Unexpected download response or content type.'),
        { status: response.statusCode },
      );
    }
    const length = response.headers['content-length'];
    const expected = length ? Number(length) : asset.bytes;
    if (
      expected !== undefined &&
      (!Number.isSafeInteger(expected) || expected < 1 || expected > maxBytes)
    ) {
      response.destroy();
      throw new AppError('FILE_LIMIT', 'Download exceeds size limits.');
    }
    const hash = createHash('sha256');
    let bytes = 0;
    try {
      for await (const piece of response) {
        signal.throwIfAborted();
        const chunk = Buffer.from(piece as Uint8Array);
        bytes += chunk.length;
        if (bytes > maxBytes) throw new AppError('FILE_LIMIT', 'Download exceeds size limits.');
        hash.update(chunk);
        await handle.writeFile(chunk);
        onProgress?.(bytes, expected);
      }
    } finally {
      response.destroy();
    }
    if (
      bytes === 0 ||
      (expected !== undefined && bytes !== expected) ||
      (asset.bytes !== undefined && bytes !== asset.bytes)
    )
      throw new AppError('DOWNLOAD_INCOMPLETE', 'Downloaded file length is incomplete.');
    const sha256 = hash.digest('hex');
    if (asset.sha256 && asset.sha256 !== sha256)
      throw new AppError(
        'CHECKSUM_MISMATCH',
        'Downloaded file checksum differs from provider metadata.',
      );
    await handle.sync();
    await handle.close();
    await link(temp, file);
    return { output: file, bytes, sha256, providerChecksumVerified: Boolean(asset.sha256) };
  } finally {
    await handle.close().catch(() => undefined);
    await rm(temp, { force: true });
  }
}
