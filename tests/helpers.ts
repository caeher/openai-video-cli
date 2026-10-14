import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
const roots: string[] = [];
export async function temporary() {
  const root = await mkdtemp(join(tmpdir(), 'oaivideo-test-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
export const signal = () => new AbortController().signal;
