import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { type Command } from 'commander';
import { z } from 'zod';
import type { Handler } from './video.js';
import { JsonStore } from '../storage/index.js';
import { generationSchema } from '../providers/types.js';
import { imageRequestSchema } from '../api/index.js';
import { estimateCost } from '../cost/index.js';
import { AppError, errorData } from '../errors/index.js';
import { fileHash, readDocument, inputPath, atomicWrite } from '../utils/files.js';
import { schedule } from '../storyboard/index.js';
import { validateRequest } from '../jobs/index.js';
import {
  authorize,
  boolOption,
  costOptions,
  numberArg,
  numberOption,
  requiredString,
} from './helpers.js';

const itemSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id: z.string().min(1), kind: z.literal('video'), request: generationSchema }),
  z.strictObject({ id: z.string().min(1), kind: z.literal('image'), request: imageRequestSchema }),
]);
const reportSchema = z.record(
  z.string(),
  z.object({
    state: z.enum(['completed', 'failed', 'blocked']),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  }),
);
export function csvCell(value: unknown) {
  let text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function loadBatch(file: string) {
  const data =
    extname(file) === '.jsonl'
      ? (await readFile(await inputPath(file, 8 * 1024 * 1024), 'utf8'))
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line) as unknown)
      : await readDocument(file);
  const items = z.array(itemSchema).min(1).max(10000).parse(data);
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new AppError('DUPLICATE_BATCH_ID', 'Batch IDs must be unique.');
  const outputs = items.filter((i) => i.kind === 'image').map((i) => resolve(i.request.output));
  if (new Set(outputs).size !== outputs.length)
    throw new AppError('DUPLICATE_OUTPUT', 'Image batch output paths must be unique.');
  return items;
}
export function registerBatch(program: Command, handle: Handler) {
  handle(
    costOptions(
      program
        .command('batch')
        .description('Native batching or a distinct local request queue')
        .command('run <file>')
        .description('Execute JSON, JSONL or YAML requests')
        .option('--mode <name>', 'local queue or native provider batch', 'local')
        .option('--concurrency <n>', 'Concurrent local requests', numberArg)
        .option('--requests-per-minute <n>', 'Local submission rate ceiling', numberArg, 60)
        .option(
          '--resume',
          'Skip persisted completed items; failed creates are never automatically duplicated',
        )
        .option('--report <path>', 'JSON or CSV report output'),
    ),
    async (ctx, opts, args) => {
      const file = String(args[0]);
      const items = await loadBatch(file);
      const mode = requiredString(opts, 'mode');
      if (!['local', 'native'].includes(mode))
        throw new AppError('BATCH_MODE', 'Use local or native.');
      const checks = items.map((item) => {
        try {
          ctx.registry.require(
            item.request.model,
            item.kind === 'video' ? item.request.operation : 'image_generation',
          );
          if (item.kind === 'video') validateRequest(item.request, ctx.registry);
          return { id: item.id, available: true };
        } catch (e) {
          return { id: item.id, available: false, error: errorData(e) };
        }
      });
      const key = createHash('sha256').update(JSON.stringify(items)).digest('hex');
      const store = new JsonStore<z.infer<typeof reportSchema>>(
        join(ctx.root, 'batches', key),
        'report',
        reportSchema,
        () => ({}),
      );
      if (boolOption(opts, 'dryRun'))
        return { mode: 'plan', processingMode: mode, requests: checks, generated: false };
      if (checks.some((c) => !c.available))
        throw new AppError(
          'BATCH_CAPABILITY_UNAVAILABLE',
          'Batch contains unsupported or unverified requests. No API request was sent.',
          'Inspect capabilities or use batch run --dry-run.',
          checks,
        );
      if (mode === 'native') {
        if (items.some((i) => i.kind !== 'video'))
          throw new AppError(
            'NATIVE_BATCH_UNAVAILABLE',
            'No native Images batch adapter is enabled. Use local mode.',
          );
        for (const item of items) ctx.registry.require(item.request.model, 'batch_generation');
        const provider = ctx.providers.get(ctx.config.provider);
        if (!provider.batch)
          throw new AppError(
            'NATIVE_BATCH_UNAVAILABLE',
            'Provider has no supported native batch operation.',
          );
        await authorize(
          ctx,
          estimateCost({ model: items[0]!.request.model, quantity: items.length }),
          opts,
        );
        return {
          mode: 'native',
          jobs: await provider.batch(
            items.filter((i) => i.kind === 'video').map((i) => i.request),
            ctx.signal,
          ),
        };
      }
      const previous: z.infer<typeof reportSchema> = boolOption(opts, 'resume')
        ? await store.read()
        : {};
      for (const item of items)
        if (item.kind === 'image' && previous[item.id]?.state === 'completed') {
          const result = z
            .object({ output: z.string(), sha256: z.string() })
            .parse(previous[item.id]!.result);
          if ((await fileHash(result.output)) !== result.sha256)
            throw new AppError(
              'CHECKSUM_MISMATCH',
              `Completed batch image ${item.id} changed on disk.`,
            );
        }
      const pending = items.filter((item) => previous[item.id]?.state !== 'completed');
      if (pending.length)
        await authorize(
          ctx,
          estimateCost({ model: pending[0]!.request.model, quantity: pending.length }),
          opts,
        );
      const rate = z.number().int().min(1).max(6000).parse(numberOption(opts, 'requestsPerMinute'));
      let nextSlot = Date.now();
      const results = await schedule(
        pending.map((item) => ({ id: item.id, dependsOn: [], value: item })),
        numberOption(opts, 'concurrency') ?? ctx.config.concurrency,
        async (item) => {
          const slot = nextSlot;
          nextSlot = Math.max(Date.now(), nextSlot) + 60000 / rate;
          if (slot > Date.now()) await delay(slot - Date.now(), undefined, { signal: ctx.signal });
          try {
            const result =
              item.kind === 'image'
                ? await ctx.assets().image(item.request, ctx.signal, boolOption(opts, 'newRequest'))
                : await ctx.jobs.submit(
                    ctx.config.provider,
                    item.request,
                    ctx.signal,
                    boolOption(opts, 'newRequest'),
                  );
            await store.update((report) => {
              report[item.id] = { state: 'completed', result };
            });
            return result;
          } catch (e) {
            await store.update((report) => {
              report[item.id] = { state: 'failed', error: errorData(e) };
            });
            throw e;
          }
        },
        ctx.signal,
      );
      await store.update((report) => Object.assign(report, results));
      const report = await store.read();
      const output = opts.report;
      if (typeof output === 'string') {
        const data = output.endsWith('.csv')
          ? [
              'id,state,result,error',
              ...Object.entries(report).map(([id, row]) =>
                [id, row.state, row.result ?? '', row.error ?? ''].map(csvCell).join(','),
              ),
            ].join('\n') + '\n'
          : JSON.stringify(report, null, 2) + '\n';
        await atomicWrite(output, data, false);
      }
      return {
        mode: 'local_queue',
        batchId: key,
        report,
        failures: Object.values(report).filter((r) => r.state !== 'completed').length,
        note: 'Video items report submission success; use jobs commands to monitor remote generation. Creation retries require explicit --new-request after review.',
      };
    },
  );
}
