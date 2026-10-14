import { type Command } from 'commander';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { configSchema } from '../config/index.js';
import { AppError, errorData } from '../errors/index.js';
import { imageRequestSchema } from '../api/index.js';
import { estimateCost } from '../cost/index.js';
import { writeJson } from '../utils/files.js';
import { runProcess } from '../media/process.js';
import { inspectImage, inspectMedia, processMedia, type MediaOperation } from '../media/index.js';
import { activity, progress } from '../cli/output.js';
import type { Handler } from './video.js';
import {
  arrayOption,
  authorize,
  boolOption,
  costOptions,
  numberArg,
  numberOption,
  promptText,
  requiredString,
  stringOption,
} from './helpers.js';

export function registerManagement(program: Command, handle: Handler) {
  handle(
    program
      .command('init')
      .description('Initialize local project metadata without credentials')
      .option('--directory <path>', 'Project directory', '.')
      .option('--interactive', 'Configure default project model and orientation'),
    async (ctx, opts) => {
      const directory = requiredString(opts, 'directory');
      let model = ctx.config.model;
      let orientation = ctx.config.orientation;
      if (boolOption(opts, 'interactive')) {
        if (!process.stdin.isTTY || opts.nonInteractive || opts.json)
          throw new AppError('INTERACTIVE_UNAVAILABLE', 'init --interactive requires a TTY.');
        model = await input({
          message: 'Default video model (auto leaves generation unavailable)',
          default: model,
        });
        orientation = await select({
          message: 'Orientation',
          choices: ['landscape', 'portrait', 'square'].map((value) => ({
            name: value,
            value: value as typeof orientation,
          })),
        });
      }
      await mkdir(directory, { recursive: true });
      const file = join(directory, 'oaivideo.project.json');
      const project = {
        schemaVersion: 1,
        name: 'OpenAI audiovisual project',
        provider: ctx.config.provider,
        model,
        orientation,
        createdAt: new Date().toISOString(),
        containsCredentials: false,
      };
      await writeJson(file, project, false);
      return {
        file,
        project,
        videoGeneration: 'unavailable',
        next: 'Create a prompt or storyboard. Run doctor for environment checks.',
      };
    },
  );
  const config = program
    .command('config')
    .description('Persistent global JSON configuration; API keys are environment-only');
  handle(
    config.command('set <key> <value>').description('Set and validate a configuration value'),
    async (ctx, _opts, args) => ctx.configuration.set(String(args[0]), String(args[1])),
  );
  handle(
    config.command('get <key>').description('Read a configuration value'),
    async (ctx, _opts, args) => {
      const key = String(args[0]);
      if (!(key in configSchema.shape))
        throw new AppError('CONFIG_KEY', `Unknown configuration key: ${key}`);
      return { key, value: ctx.config[key as keyof typeof ctx.config] };
    },
  );
  handle(config.command('list').description('Read all non-secret configuration'), async (ctx) => ({
    path: ctx.configuration.store.path,
    values: ctx.config,
  }));
  const models = program
    .command('models')
    .description('Combine reviewed documentation with account model discovery');
  handle(
    models
      .command('list')
      .description('List reviewed and discovered models')
      .option('--refresh', 'Authenticate and refresh availability using GET /models'),
    async (ctx, opts) => {
      if (boolOption(opts, 'refresh'))
        await activity('Discovering account models', opts, () => ctx.assets().discover(ctx.signal));
      return {
        models: ctx.registry.list(),
        capabilityInference: 'Documentation only; /models does not establish functionality.',
      };
    },
  );
  handle(
    models
      .command('inspect <id>')
      .description('Inspect status, restrictions, capabilities and sources'),
    async (ctx, _opts, args) => ctx.registry.inspect(String(args[0])),
  );
  handle(
    program
      .command('capabilities')
      .description('Display documented capability matrix')
      .option('--model <id>', 'Inspect one model'),
    async (ctx, opts) => {
      const model = stringOption(opts, 'model');
      return {
        verifiedAt: '2026-10-14',
        models: model ? [ctx.registry.inspect(model)] : ctx.registry.list(),
        local: ['prompts', 'motion-specifications', 'storyboard-planning', 'ffmpeg-processing'],
        future: 'Native video operations remain disabled until officially documented.',
      };
    },
  );
  handle(
    program
      .command('doctor')
      .description(
        'Check configuration, authentication and local dependencies without billed requests',
      )
      .option('--offline', 'Skip all OpenAI requests'),
    async (ctx, opts) => {
      const checks: { name: string; status: string; details: unknown }[] = [
        { name: 'configuration', status: 'ok', details: ctx.config },
      ];
      for (const binary of ['ffmpeg', 'ffprobe']) {
        try {
          const result = await runProcess(binary, ['-version'], {
            signal: ctx.signal,
            timeoutMs: 10000,
          });
          checks.push({ name: binary, status: 'ok', details: result.stdout.split('\n')[0] });
        } catch (e) {
          checks.push({ name: binary, status: 'failed', details: errorData(e) });
        }
      }
      if (boolOption(opts, 'offline'))
        checks.push({
          name: 'authentication',
          status: 'unverified',
          details: 'Offline; no request made.',
        });
      else {
        try {
          const models = await ctx.assets().discover(ctx.signal);
          checks.push({
            name: 'authentication',
            status: 'ok',
            details: 'GET /models succeeded; does not prove paid endpoint access.',
          });
          for (const id of [ctx.config.textModel, ctx.config.imageModel])
            checks.push({
              name: `model:${id}`,
              status:
                models.find((m) => m.id === id)?.availability === 'available' ? 'ok' : 'unverified',
              details: ctx.registry.inspect(id).availability,
            });
        } catch (e) {
          checks.push({ name: 'authentication', status: 'failed', details: errorData(e) });
        }
      }
      checks.push({
        name: 'video-api',
        status: 'unsupported',
        details:
          'Sora 2/Videos API retired 2026-09-24. No replacement verified; no retired endpoint was probed.',
      });
      checks.push({
        name: 'paid-endpoint-access',
        status: 'unverified',
        details:
          'Images/Responses access requires a real authorized request. Doctor makes no billed probes.',
      });
      return { healthy: !checks.some((c) => c.status === 'failed'), checks };
    },
  );
  const cost = program
    .command('cost')
    .description('Current cost estimates and measured usage reports');
  handle(
    cost
      .command('estimate')
      .description('Estimate using current evidence; unknown prices stay unknown')
      .option('--model <id>', 'Model ID')
      .option('--seconds <n>', 'Duration', numberArg)
      .option('--size <WxH>', 'Resolution')
      .option('--quantity <n>', 'Number of requests', numberArg, 1)
      .option('--regenerations <n>', 'Additional generations per request', numberArg, 0)
      .option('--mode <name>', 'native or local', 'native')
      .option('--prompt <text>', 'Prompt for text optimization estimate')
      .option('--max-output-tokens <n>', 'Maximum text output tokens', numberArg, 1024),
    async (ctx, opts) => {
      const mode = requiredString(opts, 'mode');
      if (!['native', 'local'].includes(mode))
        throw new AppError('COST_MODE', 'Use native or local.');
      return estimateCost({
        model: stringOption(opts, 'model') ?? ctx.config.model,
        seconds: numberOption(opts, 'seconds'),
        size: stringOption(opts, 'size'),
        quantity: numberOption(opts, 'quantity'),
        regenerations: numberOption(opts, 'regenerations'),
        mode: mode as 'native' | 'local',
        prompt: stringOption(opts, 'prompt'),
        maxOutputTokens: numberOption(opts, 'maxOutputTokens'),
      });
    },
  );
  handle(
    cost
      .command('report')
      .description('Summarize usage ledger; excludes unknown charges from known total'),
    async (ctx) => ctx.ledger.report(),
  );

  const image = program.command('image').description('Independent native OpenAI image generation');
  handle(
    costOptions(
      image
        .command('generate')
        .description('Generate one PNG through the official Images API')
        .option('--prompt <text>', 'Text prompt')
        .option('--prompt-file <path>', 'UTF-8 prompt')
        .option('--model <id>', 'Verified image model')
        .option('--size <WxH>', '1024x1024, 1536x1024 or 1024x1536', '1024x1024')
        .option('--quality <name>', 'low, medium or high', 'medium')
        .requiredOption('--output <path>', 'PNG output path'),
    ),
    async (ctx, opts) => {
      const request = imageRequestSchema.parse({
        model: stringOption(opts, 'model') ?? ctx.config.imageModel,
        prompt: await promptText(opts),
        size: requiredString(opts, 'size'),
        quality: requiredString(opts, 'quality'),
        output: requiredString(opts, 'output'),
      });
      ctx.registry.require(request.model, 'image_generation');
      if (!request.output.toLowerCase().endsWith('.png'))
        throw new AppError('OUTPUT_FORMAT', 'Image generation outputs PNG; use a .png path.');
      const estimate = estimateCost({ model: request.model, size: request.size });
      if (boolOption(opts, 'dryRun')) return { mode: 'plan', request, estimate, generated: false };
      await authorize(ctx, estimate, opts);
      return activity('Generating image', opts, () =>
        ctx.assets().image(request, ctx.signal, boolOption(opts, 'newRequest')),
      );
    },
  );

  const jobs = program.command('jobs').description('Persistent asynchronous job management');
  handle(
    jobs.command('list').description('List stored jobs without remote requests'),
    async (ctx) => ctx.jobs.list(),
  );
  handle(
    jobs
      .command('status <id>')
      .description('Refresh a job through documented provider status polling')
      .option('--local', 'Read stored status only'),
    async (ctx, opts, args) =>
      boolOption(opts, 'local')
        ? ctx.jobs.get(String(args[0]))
        : ctx.jobs.status(String(args[0]), ctx.signal),
  );
  handle(
    jobs
      .command('watch <id>')
      .description('Watch and persist progress with a timeout')
      .option('--timeout <ms>', 'Polling deadline', numberArg)
      .option('--interval <ms>', 'Polling interval', numberArg),
    async (ctx, opts, args) => {
      const timeoutMs = numberOption(opts, 'timeout') ?? ctx.config.timeoutMs;
      const intervalMs = numberOption(opts, 'interval') ?? ctx.config.pollIntervalMs;
      if (timeoutMs < 100 || intervalMs < 100)
        throw new AppError('POLLING_ARGUMENT', 'Timeout and interval must be at least 100ms.');
      return progress('Generation', opts, (update) =>
        ctx.jobs.watch(String(args[0]), {
          signal: ctx.signal,
          timeoutMs,
          intervalMs,
          onUpdate: (j) => update(j.progress ?? 0),
        }),
      );
    },
  );
  handle(
    jobs
      .command('cancel <id>')
      .description('Stop local monitoring; --remote is an explicit separate operation')
      .option('--remote', 'Request remote cancellation when the provider supports it'),
    async (ctx, opts, args) =>
      ctx.jobs.cancel(String(args[0]), ctx.signal, boolOption(opts, 'remote')),
  );
  handle(
    jobs
      .command('download <id>')
      .description('Refresh asset URL, verify and atomically download a completed job')
      .requiredOption('--output <path>', 'Video output path'),
    async (ctx, opts, args) =>
      progress('Download', opts, (update) =>
        ctx.jobs.download(
          String(args[0]),
          requiredString(opts, 'output'),
          ctx.signal,
          (bytes, total) => {
            if (total) update((bytes / total) * 100);
          },
        ),
      ),
  );

  const media = program
    .command('media')
    .description('Deterministic local FFmpeg processing; no AI generation');
  for (const name of ['info', 'inspect'])
    handle(
      media
        .command(`${name} <input>`)
        .description('Inspect decoded local image/audio/video metadata'),
      async (ctx, _opts, args) => {
        const file = String(args[0]);
        try {
          return { mode: 'local', kind: 'image', info: await inspectImage(file) };
        } catch {
          return { mode: 'local', kind: 'audio_video', info: await inspectMedia(file, ctx.signal) };
        }
      },
    );
  const operations: MediaOperation[] = [
    'resize',
    'trim',
    'concat',
    'extract-frame',
    'thumbnail',
    'transcode',
    'audio',
    'animate-image',
  ];
  for (const operation of operations) {
    const cmd = media
      .command(operation)
      .description(`${operation} with local FFmpeg`)
      .option('--input <path>', 'Input file')
      .option('--inputs <paths...>', 'Ordered clips for concat')
      .requiredOption('--output <path>', 'Output path; existing files are protected')
      .option('--size <WxH>', 'Output dimensions', '1280x720')
      .option('--fps <n>', 'Output frame rate', numberArg, 30)
      .option('--seconds <n>', 'Duration for trim or image animation', numberArg, 8)
      .option('--start <n>', 'Trim start in seconds', numberArg, 0)
      .option('--at <n>', 'Frame extraction time in seconds', numberArg, 0)
      .option('--codec <name>', 'h264, h265 or vp9', 'h264')
      .option('--audio-mode <name>', 'extract, remove or replace', 'extract')
      .option('--audio-input <path>', 'Replacement audio')
      .option('--effect <name>', 'zoom-in, zoom-out, pan-left, pan-right or ken-burns', 'ken-burns')
      .option('--transition <name>', 'cut, fade, wipeleft or slideright', 'cut')
      .option('--transition-seconds <n>', 'Transition duration', numberArg, 0.5)
      .option('--dry-run', 'Plan without writing or running FFmpeg');
    handle(cmd, async (ctx, opts) => {
      const raw = {
        input: stringOption(opts, 'input'),
        inputs: arrayOption(opts, 'inputs').length ? arrayOption(opts, 'inputs') : undefined,
        output: requiredString(opts, 'output'),
        size: stringOption(opts, 'size'),
        fps: numberOption(opts, 'fps'),
        seconds: numberOption(opts, 'seconds'),
        start: numberOption(opts, 'start'),
        at: numberOption(opts, 'at'),
        codec: stringOption(opts, 'codec'),
        audioMode: stringOption(opts, 'audioMode'),
        audioInput: stringOption(opts, 'audioInput'),
        effect: stringOption(opts, 'effect'),
        transition: stringOption(opts, 'transition'),
        transitionSeconds: numberOption(opts, 'transitionSeconds'),
      };
      const { mediaOptionsSchema } = await import('../media/index.js');
      const options = mediaOptionsSchema.parse({ ...raw, maxFileBytes: ctx.config.maxFileBytes });
      if (boolOption(opts, 'dryRun'))
        return { mode: 'plan', processingMode: 'local', aiGenerated: false, operation, options };
      return progress('FFmpeg', opts, (update) =>
        processMedia(operation, options, ctx.signal, update),
      );
    });
  }
}
