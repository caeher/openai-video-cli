import { setTimeout as delay } from 'node:timers/promises';

export function retryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = 'status' in error ? Number(error.status) : 0;
  const code = 'code' in error ? String(error.code) : '';
  return status === 429 || status >= 500 || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code);
}
/** For idempotent reads/downloads only. Never wrap an unprotected create call. */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseMs?: number; signal?: AbortSignal; random?: () => number } = {},
): Promise<T> {
  const { attempts = 4, baseMs = 500, signal, random = Math.random } = options;
  for (let n = 0; ; n++) {
    signal?.throwIfAborted();
    try {
      return await fn();
    } catch (e) {
      if (n + 1 >= attempts || !retryable(e)) throw e;
      const headers = e && typeof e === 'object' && 'headers' in e ? e.headers : null;
      const retryAfter = headers instanceof Headers ? headers.get('retry-after') : null;
      const wait =
        retryAfter && Number.isFinite(Number(retryAfter))
          ? Math.min(60000, Number(retryAfter) * 1000)
          : Math.min(30000, baseMs * 2 ** n) * (0.5 + random());
      await delay(Math.max(0, wait), undefined, { signal });
    }
  }
}
