import { type Command } from 'commander';
import { join } from 'node:path';
import type { Context } from '../cli/context.js';
import { generationSchema, type GenerationRequest } from '../providers/types.js';
import type { CapabilityName } from '../registry/types.js';
import { validateRequest } from '../jobs/index.js';
import { inspectImage, inspectMedia } from '../media/index.js';
import { estimateCost } from '../cost/index.js';
import { activity, progress } from '../cli/output.js';
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
  type Options,
} from './helpers.js';
import { AppError } from '../errors/index.js';

export type Handler = (
  command: Command,
  fn: (context: Context, options: Options, args: unknown[]) => Promise<unknown>,
) => void;
export function registerVideo(program: Command, handle: Handler) {
  const definitions: [string, CapabilityName, string][] = [
    ['generate', 'text_to_video', 'Generate video from text when a documented active API exists'],
    ['animate', 'image_to_video', 'Animate an image using native image-to-video'],
    ['edit', 'video_edit', 'Edit an existing video using a documented native operation'],
    ['extend', 'video_extension', 'Generatively extend a clip; does not concatenate locally'],
    ['remix', 'video_remix', 'Create a native variant of a prior video'],
  ];
  for (const [name, capability, description] of definitions) {
    const command = costOptions(
      program
        .command(name)
        .description(description)
        .option('--prompt <text>', 'Natural-language prompt')
        .option('--prompt-file <path>', 'UTF-8 prompt file')
        .option('--model <id>', 'Documented model ID')
        .option('--provider <id>', 'Registered provider')
        .option('--size <WxH>', 'Model-supported resolution')
        .option('--seconds <number>', 'Model-supported duration', numberArg)
        .option('--orientation <value>', 'landscape, portrait or square')
        .option('--output <path>', 'Output video path')
        .option('--image <path>', 'Initial image (animate only)')
        .option('--input <path>', 'Input video (edit/extend/remix)')
        .option('--first-frame <path>', 'First frame when explicitly supported')
        .option('--last-frame <path>', 'Last frame when explicitly supported')
        .option('--reference <paths...>', 'Image references; native support required')
        .option(
          '--character-reference <ids...>',
          'Provider character IDs; distinct from image references',
        )
        .option('--parent-job <id>', 'Related original job for extension/remix')
        .option('--wait', 'Poll and download after completion'),
    );
    handle(command, async (ctx, opts) => {
      const prompt = await promptText(opts);
      const model = ctx.registry.resolveVideo(
        stringOption(opts, 'model') ?? ctx.config.model,
        capability,
      );
      const request: GenerationRequest = generationSchema.parse({
        operation: capability,
        model: model.id,
        prompt,
        size: stringOption(opts, 'size') ?? ctx.config.size,
        seconds: numberOption(opts, 'seconds') ?? ctx.config.seconds,
        orientation: stringOption(opts, 'orientation') ?? ctx.config.orientation,
        image: stringOption(opts, 'image'),
        input: stringOption(opts, 'input'),
        firstFrame: stringOption(opts, 'firstFrame'),
        lastFrame: stringOption(opts, 'lastFrame'),
        references: [
          ...arrayOption(opts, 'reference').map((path) => ({ kind: 'image', path })),
          ...arrayOption(opts, 'characterReference').map((path) => ({ kind: 'character', path })),
        ],
        parentJobId: stringOption(opts, 'parentJob'),
      });
      validateRequest(request, ctx.registry);
      if (capability === 'image_to_video') {
        if (!request.image) throw new AppError('IMAGE_REQUIRED', 'animate requires --image.');
        await inspectImage(request.image);
      } else if (request.image)
        throw new AppError('OPTION_CONFLICT', '--image is only used by animate.');
      if (['video_edit', 'video_extension', 'video_remix'].includes(capability)) {
        if (!request.input) throw new AppError('VIDEO_REQUIRED', `${name} requires --input.`);
        await inspectMedia(request.input, ctx.signal);
      } else if (request.input)
        throw new AppError('OPTION_CONFLICT', '--input is only used by edit, extend and remix.');
      for (const image of [
        request.firstFrame,
        request.lastFrame,
        ...request.references.filter((r) => r.kind !== 'character').map((r) => r.path),
      ].filter((v): v is string => Boolean(v)))
        await inspectImage(image);
      const estimate = estimateCost({
        model: model.id,
        seconds: request.seconds,
        size: request.size,
      });
      if (boolOption(opts, 'dryRun')) return { mode: 'plan', request, estimate, generated: false };
      await authorize(ctx, estimate, opts);
      const job = await activity('Submitting video request', opts, () =>
        ctx.jobs.submit(
          stringOption(opts, 'provider') ?? ctx.config.provider,
          request,
          ctx.signal,
          boolOption(opts, 'newRequest'),
        ),
      );
      if (!boolOption(opts, 'wait')) return job;
      const completed = await progress('Generation', opts, (update) =>
        ctx.jobs.watch(job.id, {
          signal: ctx.signal,
          timeoutMs: ctx.config.timeoutMs,
          intervalMs: ctx.config.pollIntervalMs,
          onUpdate: (j) => update(j.progress ?? 0),
        }),
      );
      if (completed.state !== 'completed')
        throw new AppError(
          'GENERATION_FAILED',
          'Video generation did not complete.',
          'Inspect jobs status.',
          completed,
        );
      const output = stringOption(opts, 'output') ?? join(ctx.config.output, `${job.id}.mp4`);
      return { job: completed, download: await ctx.jobs.download(job.id, output, ctx.signal) };
    });
  }
  const characters = program
    .command('characters')
    .description('Native reusable video characters (currently unavailable)');
  const create = characters
    .command('create')
    .description('Create a native character reference')
    .requiredOption('--name <name>', 'Character name')
    .requiredOption('--video <path>', 'Reference video')
    .option('--model <id>', 'Model ID');
  const list = characters
    .command('list')
    .description('List native character references')
    .option('--model <id>', 'Model ID');
  const inspect = characters
    .command('inspect <id>')
    .description('Inspect native character reference')
    .option('--model <id>', 'Model ID');
  const remove = characters
    .command('delete <id>')
    .description('Delete a native character reference')
    .option('--model <id>', 'Model ID');
  for (const cmd of [create, list, inspect, remove])
    handle(cmd, async (ctx, opts, args) => {
      ctx.registry.resolveVideo(
        stringOption(opts, 'model') ?? ctx.config.model,
        'character_reference',
      );
      const provider = ctx.providers.get(ctx.config.provider);
      if (!provider.characters)
        throw new AppError(
          'CHARACTERS_UNAVAILABLE',
          'Provider has no documented characters operation.',
        );
      if (cmd === create) {
        const video = requiredString(opts, 'video');
        await inspectMedia(video, ctx.signal);
        return provider.characters.create(
          { name: requiredString(opts, 'name'), video },
          ctx.signal,
        );
      }
      if (cmd === list) return provider.characters.list(ctx.signal);
      if (cmd === inspect) return provider.characters.inspect(String(args[0]), ctx.signal);
      await provider.characters.delete(String(args[0]), ctx.signal);
      return { deleted: String(args[0]) };
    });
}
