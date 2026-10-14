import { type Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildPrompt, promptFields, templates, validatePrompt } from '../prompt/index.js';
import { readDocument, writeJson, atomicWrite, inputPath, outputPath } from '../utils/files.js';
import { motionSchema, validateMotion } from '../motion/index.js';
import { inspectImage } from '../media/index.js';
import { estimateCost } from '../cost/index.js';
import {
  renderStoryboard,
  resolveStoryboard,
  storyboardPlan,
  storyboardStatus,
  validateStoryboard,
} from '../storyboard/index.js';
import { activity } from '../cli/output.js';
import { AppError } from '../errors/index.js';
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
import type { Handler } from './video.js';

function fieldsOptions(command: Command) {
  for (const field of promptFields)
    command.option(`--${field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} <text>`, field);
  return command;
}
async function promptSpec(opts: Options) {
  const file = stringOption(opts, 'file');
  const base = file ? await readDocument(file) : {};
  if (!base || typeof base !== 'object' || Array.isArray(base))
    throw new AppError('PROMPT_DOCUMENT', 'Prompt document must be an object.');
  const template = stringOption(opts, 'template');
  if (template && !templates[template])
    throw new AppError(
      'TEMPLATE_UNKNOWN',
      `Unknown template ${template}.`,
      'Use prompt templates.',
    );
  const args = Object.fromEntries(
    promptFields
      .filter((key) => stringOption(opts, key))
      .map((key) => [key, stringOption(opts, key)]),
  );
  return { ...(template ? templates[template] : {}), ...base, ...args };
}
export function registerPlanning(program: Command, handle: Handler) {
  const prompt = program
    .command('prompt')
    .description('Build natural-language prompt planning artifacts');
  handle(
    prompt.command('templates').description('List available templates'),
    async () => templates,
  );
  for (const name of ['create', 'build', 'inspect', 'validate']) {
    const cmd = fieldsOptions(
      prompt
        .command(name)
        .description(`${name} a structured prompt`)
        .option('--file <path>', 'JSON/YAML prompt specification')
        .option('--template <name>', 'Template defaults')
        .option('--output <path>', 'Write JSON specification (create) or UTF-8 text (build)')
        .option('--interactive', 'Ask for template, subject, action and camera'),
    );
    handle(cmd, async (_ctx, opts) => {
      if (boolOption(opts, 'interactive')) {
        if (!process.stdin.isTTY || opts.nonInteractive || opts.json)
          throw new AppError(
            'INTERACTIVE_UNAVAILABLE',
            'Interactive prompting needs a TTY and human output.',
          );
        opts.template = await select({
          message: 'Template',
          choices: Object.keys(templates).map((value) => ({ name: value, value })),
        });
        opts.subject = await input({ message: 'Subject', required: true });
        opts.mainAction = await input({ message: 'Main action', required: true });
        opts.cameraMovement = await input({
          message: 'Camera movement',
          default: 'Slow smooth dolly',
        });
      }
      const raw = await promptSpec(opts);
      const result = name === 'validate' ? validatePrompt(raw) : buildPrompt(raw);
      const output = stringOption(opts, 'output');
      if (output) {
        if (name === 'create') await writeJson(output, result.spec, false);
        else if (name === 'build') await atomicWrite(output, result.text + '\n', false);
        else throw new AppError('OPTION_CONFLICT', '--output is supported by create and build.');
      }
      return result;
    });
  }
  handle(
    costOptions(
      prompt
        .command('optimize')
        .description('Explicit paid prompt optimization using Responses API')
        .option('--prompt <text>', 'Description to optimize')
        .option('--prompt-file <path>', 'UTF-8 description')
        .option('--model <id>', 'Verified text model')
        .option('--max-output-tokens <n>', 'Output token ceiling', numberArg, 1024)
        .option('--output <path>', 'Write optimized text'),
    ),
    async (ctx, opts) => {
      const text = await promptText(opts);
      const model = stringOption(opts, 'model') ?? ctx.config.textModel;
      const maxOutputTokens = numberOption(opts, 'maxOutputTokens') ?? 1024;
      ctx.registry.require(model, 'text_optimization');
      const estimate = estimateCost({ model, prompt: text, maxOutputTokens });
      if (boolOption(opts, 'dryRun')) return { mode: 'plan', model, estimate, generated: false };
      const output = stringOption(opts, 'output');
      if (output) await outputPath(output);
      await authorize(ctx, estimate, opts);
      const result = await activity('Optimizing prompt', opts, () =>
        ctx
          .assets()
          .optimize(text, model, maxOutputTokens, ctx.signal, boolOption(opts, 'newRequest')),
      );
      if (output) await atomicWrite(output, result.text + '\n', false);
      return { ...result, estimate };
    },
  );

  const motion = program
    .command('motion')
    .description('Local motion specifications; no native mask submission');
  handle(
    motion
      .command('create')
      .description('Store regional motion metadata locally')
      .option('--file <path>', 'Complete JSON/YAML specification')
      .option('--image <path>', 'Source image')
      .option('--mask <path>', 'PNG mask matching image dimensions')
      .option('--prompt <text>', 'Motion description')
      .option('--stationary <elements...>', 'Elements that should remain still')
      .requiredOption('--output <path>', 'Specification JSON output'),
    async (_ctx, opts) => {
      const output = resolve(requiredString(opts, 'output'));
      const base = dirname(output);
      const file = stringOption(opts, 'file');
      const raw = file
        ? await readDocument(file)
        : {
            image: requiredString(opts, 'image'),
            mask: stringOption(opts, 'mask'),
            prompt: requiredString(opts, 'prompt'),
            stationary: arrayOption(opts, 'stationary'),
          };
      const spec = motionSchema.parse(raw);
      spec.image = await inputPath(file ? resolve(dirname(resolve(file)), spec.image) : spec.image);
      if (spec.mask)
        spec.mask = await inputPath(file ? resolve(dirname(resolve(file)), spec.mask) : spec.mask);
      const result = await validateMotion(spec);
      await writeJson(output, spec, false);
      return { ...result, output, root: base };
    },
  );
  for (const name of ['inspect', 'validate'])
    handle(
      motion
        .command(`${name} <file>`)
        .description(`${name} motion specification and mask geometry`),
      async (_ctx, _opts, args) => {
        const file = String(args[0]);
        const spec = motionSchema.parse(await readDocument(file));
        spec.image = resolve(dirname(resolve(file)), spec.image);
        if (spec.mask) spec.mask = resolve(dirname(resolve(file)), spec.mask);
        return validateMotion(spec);
      },
    );

  const references = program
    .command('references')
    .description('Inspect typed local visual references');
  handle(
    references
      .command('inspect')
      .description('Inspect image metadata and distinguish reference roles')
      .requiredOption('--image <path>', 'Local image')
      .option('--kind <role>', 'image, first_frame, last_frame or character', 'image')
      .option('--model <id>', 'Model for compatibility assessment'),
    async (ctx, opts) => {
      const role = requiredString(opts, 'kind');
      if (!['image', 'first_frame', 'last_frame', 'character'].includes(role))
        throw new AppError('REFERENCE_KIND', 'Invalid reference role.');
      const image = await inspectImage(requiredString(opts, 'image'));
      return {
        role,
        image,
        model: ctx.registry.inspect(stringOption(opts, 'model') ?? ctx.config.model),
        nativeVideoSupported: false,
        explanation:
          role === 'character'
            ? 'A local portrait is not a native reusable character ID; character input requirements are provider-specific.'
            : 'Image references and frame controls are distinct capabilities. This inspection does not submit anything.',
      };
    },
  );

  const storyboard = program
    .command('storyboard')
    .description('Plan scenes or explicitly assemble existing clips locally');
  handle(
    storyboard
      .command('create')
      .description('Create a validated multi-scene project')
      .option('--file <path>', 'Existing JSON/YAML storyboard')
      .option('--name <name>', 'Project name', 'Untitled project')
      .option(
        '--prompt <text>',
        'Single-scene starter prompt',
        'Describe the subject, scene and main action.',
      )
      .requiredOption('--output <path>', 'Storyboard JSON path'),
    async (_ctx, opts) => {
      const file = stringOption(opts, 'file');
      const board = file
        ? validateStoryboard(await readDocument(file))
        : validateStoryboard({
            name: requiredString(opts, 'name'),
            scenes: [
              {
                id: 'scene-1',
                order: 0,
                description: 'Opening scene',
                prompt: requiredString(opts, 'prompt'),
                output: 'clips/scene-1.mp4',
              },
            ],
          });
      await writeJson(requiredString(opts, 'output'), board, false);
      return { mode: 'local', storyboard: board, generated: false };
    },
  );
  handle(
    storyboard
      .command('validate <file>')
      .description('Validate schema, dependency graph, paths and generation plan'),
    async (ctx, _opts, args) => ({
      valid: true,
      ...storyboardPlan(
        await resolveStoryboard(await readDocument(String(args[0])), String(args[0])),
        ctx.registry,
      ),
    }),
  );
  handle(
    costOptions(
      storyboard
        .command('render <file>')
        .description('Render native scenes or mount existing clips with --local')
        .option('--local', 'Use only pre-existing scene inputs; deterministic assembly')
        .option(
          '--resume',
          'Reuse completed matching scenes after checksum verification; export output must be new',
        )
        .option('--concurrency <n>', 'Maximum concurrent independent scenes', numberArg),
    ),
    async (ctx, opts, args) => {
      const file = String(args[0]);
      const board = await resolveStoryboard(await readDocument(file), file);
      const local = boolOption(opts, 'local');
      if (boolOption(opts, 'dryRun'))
        return {
          ...storyboardPlan(board, ctx.registry),
          requestedMode: local ? 'local' : 'generative',
        };
      if (!local) {
        for (const scene of board.scenes) ctx.registry.resolveVideo(scene.model, 'text_to_video');
        await authorize(
          ctx,
          estimateCost({ model: board.scenes[0]!.model, quantity: board.scenes.length }),
          opts,
        );
      }
      const key = createHash('sha256').update(resolve(file)).digest('hex').slice(0, 24);
      return activity('Rendering storyboard', opts, () =>
        renderStoryboard(board, {
          local,
          concurrency: numberOption(opts, 'concurrency') ?? ctx.config.concurrency,
          signal: ctx.signal,
          jobs: ctx.jobs,
          provider: ctx.config.provider,
          registry: ctx.registry,
          stateRoot: join(ctx.root, 'storyboards', key),
          timeoutMs: ctx.config.timeoutMs,
          pollMs: ctx.config.pollIntervalMs,
          resume: boolOption(opts, 'resume'),
          maxFileBytes: ctx.config.maxFileBytes,
        }),
      );
    },
  );
  handle(
    storyboard
      .command('status <file>')
      .description('Read persisted scene statuses without making API requests'),
    async (ctx, _opts, args) => {
      const file = String(args[0]);
      const key = createHash('sha256').update(resolve(file)).digest('hex').slice(0, 24);
      return {
        file: resolve(file),
        scenes: await storyboardStatus(join(ctx.root, 'storyboards', key)),
      };
    },
  );
}
