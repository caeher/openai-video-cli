import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const entry = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(process.execPath, [entry, 'run', 'tests/integration/real-api.test.ts'], {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, OAIVIDEO_REAL_API: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
