import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { temporary } from '../helpers.js';
const exec = promisify(execFile);
const cli = resolve('src/cli.ts');
async function run(args: string[], root: string) {
  try {
    const result = await exec(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), cli, ...args],
      {
        env: { ...process.env, OPENAI_API_KEY: '', OAIVIDEO_HOME: join(root, 'state') },
        cwd: root,
      },
    );
    return { code: 0, ...result };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return e;
  }
}
describe('CLI end-to-end without API credits', () => {
  it('shows help and has all requested command groups', async () => {
    const result = await run(['--help'], await temporary());
    expect(result.code).toBe(0);
    for (const name of [
      'generate',
      'animate',
      'edit',
      'extend',
      'remix',
      'characters',
      'prompt',
      'storyboard',
      'batch',
      'jobs',
      'media',
      'cost',
    ])
      expect(result.stdout).toContain(name);
  });
  it('returns stable JSON errors for unsupported video and malformed options', async () => {
    const root = await temporary();
    const disabled = await run(['generate', '--prompt', 'A forest', '--json'], root);
    expect(disabled.code).toBe(1);
    expect(JSON.parse(disabled.stdout).error.code).toBe('NO_ACTIVE_VIDEO_API');
    expect(disabled.stderr).toBe('');
    const retired = await run(
      ['animate', '--image', 'missing.png', '--prompt', 'Pan', '--model', 'sora-2', '--json'],
      root,
    );
    expect(JSON.parse(retired.stdout).error.code).toBe('MODEL_RETIRED');
    const bad = await run(['generate', '--seconds', 'NaN', '--json'], root);
    expect(JSON.parse(bad.stdout).error.code).toBe('ARGUMENT_ERROR');
    expect(bad.stderr).toBe('');
  });
  it('builds YAML prompts and writes a real planning file', async () => {
    const root = await temporary();
    await writeFile(
      join(root, 'prompt.yaml'),
      'subject: Tropical island\nmainAction: Waves reach the shore\ncameraMovement: Slow aerial orbit\n',
    );
    const result = await run(
      ['prompt', 'build', '--file', 'prompt.yaml', '--output', 'prompt.txt', '--json'],
      root,
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).data.text).toContain('Slow aerial orbit');
    expect(await readFile(join(root, 'prompt.txt'), 'utf8')).toContain('Tropical island');
  });
  it('persists global config and initializes projects without secrets', async () => {
    const root = await temporary();
    expect((await run(['config', 'set', 'concurrency', '3', '--json'], root)).code).toBe(0);
    const value = await run(['config', 'get', 'concurrency', '--json'], root);
    expect(JSON.parse(value.stdout).data.value).toBe(3);
    const initialized = await run(['init', '--json'], root);
    expect(initialized.code).toBe(0);
    expect(await readFile(join(root, 'oaivideo.project.json'), 'utf8')).not.toContain('API_KEY');
    const secret = await run(['config', 'set', 'apiKey', 'sk-secret', '--json'], root);
    expect(JSON.parse(secret.stdout).error.code).toBe('CONFIG_KEY');
  });
  it('validates unavailable storyboards and batch dry runs without presenting generated videos', async () => {
    const root = await temporary();
    await writeFile(
      join(root, 'board.json'),
      JSON.stringify({
        name: 'Test',
        scenes: [
          { id: 'a', order: 0, description: 'A forest', prompt: 'A forest', output: 'a.mp4' },
        ],
      }),
    );
    const plan = await run(['storyboard', 'validate', 'board.json', '--json'], root);
    expect(plan.code).toBe(0);
    const data = JSON.parse(plan.stdout).data;
    expect(data.generated).toBe(false);
    expect(data.scenes[0].available).toBe(false);
    await writeFile(
      join(root, 'batch.jsonl'),
      JSON.stringify({
        id: 'a',
        kind: 'video',
        request: { operation: 'text_to_video', model: 'sora-2', prompt: 'A forest' },
      }) + '\n',
    );
    const batch = await run(['batch', 'run', 'batch.jsonl', '--dry-run', '--json'], root);
    expect(JSON.parse(batch.stdout).data.generated).toBe(false);
    expect(JSON.parse(batch.stdout).data.requests[0].available).toBe(false);
  });
  it('image dry-run does not need credentials and unknown cost is guarded before authentication', async () => {
    const root = await temporary();
    const args = ['image', 'generate', '--prompt', 'A forest', '--output', 'forest.png', '--json'];
    const dry = await run([...args, '--dry-run'], root);
    expect(dry.code).toBe(0);
    expect(JSON.parse(dry.stdout).data.estimate.amount).toBeNull();
    const guarded = await run(args, root);
    expect(JSON.parse(guarded.stdout).error.code).toBe('COST_UNKNOWN');
  });
});
