import { beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { inspectMedia, inspectImage, processMedia } from '../../src/media/index.js';
import { runProcess } from '../../src/media/process.js';
import { validateMotion } from '../../src/motion/index.js';
import { ModelRegistry } from '../../src/registry/index.js';
import { ProviderRegistry } from '../../src/providers/index.js';
import { JobManager } from '../../src/jobs/index.js';
import { renderStoryboard, validateStoryboard } from '../../src/storyboard/index.js';
import { signal, temporary } from '../helpers.js';

const available =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
beforeAll(() => {
  if (process.env.OAIVIDEO_REQUIRE_FFMPEG === '1' && !available)
    throw new Error('FFmpeg/FFprobe are required by this verification run.');
});
describe.runIf(available)('real local multimedia integration', () => {
  async function clip(root: string, name = 'input.mp4', withAudio = true) {
    const output = join(root, name);
    const inputs = ['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24'];
    if (withAudio) inputs.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000');
    await runProcess('ffmpeg', [
      '-v',
      'error',
      ...inputs,
      '-t',
      '1.5',
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      ...(withAudio ? ['-c:a', 'aac'] : []),
      output,
    ]);
    return output;
  }
  it('resizes, trims, extracts frames and audio and protects existing files', async () => {
    const root = await temporary();
    const input = await clip(root);
    const resized = await processMedia(
      'resize',
      { input, output: join(root, 'resized.mp4'), size: '640x360', fps: 30 },
      signal(),
    );
    expect(resized.aiGenerated).toBe(false);
    const info = await inspectMedia(resized.output);
    expect(info.streams.find((s) => s.codec_type === 'video')?.width).toBe(640);
    const trimmed = await processMedia(
      'trim',
      { input, output: join(root, 'trimmed.mp4'), start: 0.25, seconds: 0.75 },
      signal(),
    );
    expect(Number((await inspectMedia(trimmed.output)).format.duration)).toBeCloseTo(0.75, 1);
    const frame = await processMedia(
      'extract-frame',
      { input, output: join(root, 'frame.png'), at: 0.5 },
      signal(),
    );
    expect((await inspectImage(frame.output)).width).toBe(320);
    const audio = await processMedia(
      'audio',
      { input, output: join(root, 'audio.wav'), audioMode: 'extract' },
      signal(),
    );
    expect((await inspectMedia(audio.output)).streams[0]?.codec_type).toBe('audio');
    await expect(
      processMedia('resize', { input, output: resized.output }, signal()),
    ).rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
  });
  it('concatenates heterogeneous clips and normalizes missing audio with fade transitions', async () => {
    const root = await temporary();
    const a = await clip(root, 'a.mp4');
    const b = await clip(root, 'b.mp4', false);
    const result = await processMedia(
      'concat',
      {
        inputs: [a, b],
        output: join(root, 'joined.mp4'),
        size: '320x180',
        fps: 24,
        transition: 'fade',
        transitionSeconds: 0.3,
      },
      signal(),
    );
    const info = await inspectMedia(result.output);
    expect(Number(info.format.duration)).toBeCloseTo(2.7, 1);
    expect(info.streams.some((s) => s.codec_type === 'audio')).toBe(true);
  });
  it('animates an image deterministically and validates mask alignment', async () => {
    const root = await temporary();
    const image = join(root, 'image.png');
    await sharp({ create: { width: 320, height: 180, channels: 3, background: '#004455' } })
      .png()
      .toFile(image);
    const animated = await processMedia(
      'animate-image',
      { input: image, output: join(root, 'kenburns.mp4'), size: '320x180', seconds: 1, fps: 24 },
      signal(),
    );
    expect(animated.mode).toBe('local');
    expect(animated.aiGenerated).toBe(false);
    const mask = join(root, 'mask.png');
    await sharp({ create: { width: 32, height: 18, channels: 3, background: 'white' } })
      .png()
      .toFile(mask);
    await expect(
      validateMotion({ image, mask, prompt: 'Animate only water' }),
    ).rejects.toMatchObject({ code: 'MASK_DIMENSIONS' });
    const result = await validateMotion({
      image,
      prompt: 'Animate water',
      regions: [
        {
          id: 'water',
          polygon: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          description: 'Gentle ripples',
        },
      ],
    });
    expect(result.nativeSupported).toBe(false);
    expect(result.textualPrompt).toContain('Gentle ripples');
  });
  it('mounts a local storyboard and persists scene statuses', async () => {
    const root = await temporary();
    const a = await clip(root, 'a.mp4');
    const b = await clip(root, 'b.mp4');
    const board = validateStoryboard({
      name: 'Local',
      scenes: [
        {
          id: 'a',
          order: 0,
          description: 'A',
          prompt: 'A',
          inputs: [a],
          output: join(root, 'scene-a.mp4'),
        },
        {
          id: 'b',
          order: 1,
          description: 'B',
          prompt: 'B',
          inputs: [b],
          output: join(root, 'scene-b.mp4'),
          dependsOn: ['a'],
        },
      ],
      export: { output: join(root, 'final.mp4'), size: '320x180', fps: 24 },
    });
    const registry = new ModelRegistry();
    const result = await renderStoryboard(board, {
      local: true,
      concurrency: 2,
      signal: signal(),
      jobs: new JobManager(root, registry, new ProviderRegistry()),
      provider: 'openai',
      registry,
      stateRoot: join(root, 'state'),
      timeoutMs: 1000,
      pollMs: 100,
    });
    expect(result.aiGenerated).toBe(false);
    expect(
      JSON.parse(await readFile(join(root, 'state', 'storyboard-status.json'), 'utf8')).b.state,
    ).toBe('completed');
  });
  it('passes shell metacharacters only as file names and rejects remote playlists', async () => {
    const root = await temporary();
    const input = await clip(root, 'input;echo-danger.mp4');
    const output = join(root, 'output;literal.mp4');
    await processMedia('trim', { input, output, seconds: 0.5 }, signal());
    const playlist = join(root, 'malicious.m3u8');
    await writeFile(
      playlist,
      '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nhttp://169.254.169.254/secret.ts\n#EXT-X-ENDLIST\n',
    );
    await expect(inspectMedia(playlist, signal())).rejects.toThrow();
  });
  it('resumes verified completed local scenes without overwriting or rendering again', async () => {
    const root = await temporary();
    const input = await clip(root);
    const board = validateStoryboard({
      name: 'Resume',
      scenes: [
        {
          id: 'a',
          order: 0,
          description: 'A',
          prompt: 'A',
          size: '320x180',
          inputs: [input],
          output: join(root, 'rendered.mp4'),
        },
      ],
    });
    const registry = new ModelRegistry();
    const options = {
      local: true,
      concurrency: 1,
      signal: signal(),
      jobs: new JobManager(root, registry, new ProviderRegistry()),
      provider: 'openai',
      registry,
      stateRoot: join(root, 'state'),
      timeoutMs: 1000,
      pollMs: 100,
    };
    const first = await renderStoryboard(board, options);
    const second = await renderStoryboard(board, { ...options, resume: true });
    expect(second.scenes).toEqual(first.scenes);
    await writeFile(join(root, 'rendered.mp4'), 'changed');
    await expect(renderStoryboard(board, { ...options, resume: true })).rejects.toMatchObject({
      code: 'STORYBOARD_FAILED',
    });
  });
});
