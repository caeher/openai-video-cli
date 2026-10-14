import { z } from 'zod';
import { dirname, resolve } from 'node:path';
import { ModelRegistry } from '../registry/index.js';
import { referenceSchema, generationSchema } from '../providers/types.js';
import { AppError, errorData } from '../errors/index.js';
import { fileHash, inside, outputPath } from '../utils/files.js';
import { processMedia } from '../media/index.js';
import type { JobManager } from '../jobs/index.js';
import { JsonStore } from '../storage/index.js';

export const sceneSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  order: z.number().int().min(0),
  description: z.string().min(1),
  prompt: z.string().min(1).max(32000),
  model: z.string().default('auto'),
  seconds: z.number().positive().max(600).default(8),
  size: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .default('1280x720'),
  references: z.array(referenceSchema).default([]),
  style: z.string().optional(),
  camera: z.string().optional(),
  audio: z.string().optional(),
  inputs: z.array(z.string()).default([]),
  output: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
});
export const storyboardSchema = z.strictObject({
  version: z.literal(1).default(1),
  name: z.string().min(1),
  scenes: z.array(sceneSchema).min(1).max(1000),
  export: z
    .strictObject({
      output: z.string(),
      size: z.string().default('1280x720'),
      fps: z.number().int().min(1).max(120).default(30),
      transition: z.enum(['cut', 'fade', 'wipeleft', 'slideright']).default('cut'),
      transitionSeconds: z.number().positive().max(10).default(0.5),
    })
    .optional(),
});
export type Storyboard = z.infer<typeof storyboardSchema>;
export function validateStoryboard(raw: unknown) {
  const board = storyboardSchema.parse(raw);
  const ids = new Set(board.scenes.map((s) => s.id));
  if (
    ids.size !== board.scenes.length ||
    new Set(board.scenes.map((s) => s.order)).size !== board.scenes.length
  )
    throw new AppError('DUPLICATE_SCENE', 'Scene IDs and order values must be unique.');
  if (new Set(board.scenes.map((s) => s.output)).size !== board.scenes.length)
    throw new AppError('DUPLICATE_OUTPUT', 'Scenes cannot share output paths.');
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id))
      throw new AppError('STORYBOARD_CYCLE', 'Scene dependencies contain a cycle.');
    if (visited.has(id)) return;
    active.add(id);
    const scene = board.scenes.find((s) => s.id === id)!;
    for (const dep of scene.dependsOn) {
      if (!ids.has(dep)) throw new AppError('MISSING_DEPENDENCY', `Unknown dependency ${dep}.`);
      visit(dep);
    }
    active.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  return board;
}
export async function resolveStoryboard(raw: unknown, file: string) {
  const board = validateStoryboard(raw);
  const root = dirname(resolve(file));
  for (const scene of board.scenes) {
    scene.output = await inside(root, scene.output);
    scene.inputs = await Promise.all(scene.inputs.map((p) => inside(root, p)));
    for (const ref of scene.references) ref.path = await inside(root, ref.path);
  }
  if (board.export) board.export.output = await inside(root, board.export.output);
  return board;
}
export function storyboardPlan(board: Storyboard, registry: ModelRegistry) {
  return {
    mode: 'plan',
    generated: false,
    name: board.name,
    scenes: board.scenes
      .sort((a, b) => a.order - b.order)
      .map((scene) => {
        try {
          const model = registry.resolveVideo(scene.model, 'text_to_video');
          return { ...scene, model: model.id, available: true, error: null };
        } catch (e) {
          return { ...scene, available: false, error: errorData(e) };
        }
      }),
    totalSeconds: board.scenes.reduce((n, s) => n + s.seconds, 0),
    warnings: [
      'Dependency ordering does not guarantee visual continuity. References require explicit provider support.',
    ],
  };
}

/** Dependency-aware bounded queue shared by storyboard and local batches. */
export async function schedule<T>(
  items: { id: string; dependsOn: string[]; value: T }[],
  concurrency: number,
  worker: (value: T) => Promise<unknown>,
  signal: AbortSignal,
) {
  z.number().int().min(1).max(16).parse(concurrency);
  const pending = new Map(items.map((i) => [i.id, i]));
  const results = new Map<
    string,
    { state: 'completed' | 'failed' | 'blocked'; result?: unknown; error?: unknown }
  >();
  const running = new Map<string, Promise<void>>();
  while (pending.size || running.size) {
    signal.throwIfAborted();
    for (const [id, item] of pending) {
      if (
        item.dependsOn.some((dep) => results.has(dep) && results.get(dep)!.state !== 'completed')
      ) {
        results.set(id, { state: 'blocked', error: 'Dependency failed.' });
        pending.delete(id);
        continue;
      }
      if (
        running.size >= concurrency ||
        !item.dependsOn.every((dep) => results.get(dep)?.state === 'completed')
      )
        continue;
      pending.delete(id);
      const task = Promise.resolve()
        .then(() => worker(item.value))
        .then(
          (result) => {
            results.set(id, { state: 'completed', result });
          },
          (error) => {
            results.set(id, { state: 'failed', error: errorData(error) });
          },
        )
        .finally(() => running.delete(id));
      running.set(id, task);
    }
    if (running.size) await Promise.race(running.values());
    else if (pending.size)
      throw new AppError('DEPENDENCY_DEADLOCK', 'Queue contains missing or cyclic dependencies.');
  }
  return Object.fromEntries(results);
}
const renderStateSchema = z.record(
  z.string(),
  z.object({
    state: z.string(),
    specHash: z.string().optional(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  }),
);
export async function renderStoryboard(
  board: Storyboard,
  options: {
    local: boolean;
    concurrency: number;
    signal: AbortSignal;
    jobs: JobManager;
    provider: string;
    registry: ModelRegistry;
    stateRoot: string;
    timeoutMs: number;
    pollMs: number;
    resume?: boolean;
    maxFileBytes?: number;
  },
) {
  const store = new JsonStore<z.infer<typeof renderStateSchema>>(
    options.stateRoot,
    'storyboard-status',
    renderStateSchema,
    () => ({}),
  );
  const previous: z.infer<typeof renderStateSchema> = options.resume ? await store.read() : {};
  if (!options.local)
    for (const scene of board.scenes) options.registry.resolveVideo(scene.model, 'text_to_video');
  if (board.export) await outputPath(board.export.output);
  const results = await schedule(
    board.scenes.map((scene) => ({ id: scene.id, dependsOn: scene.dependsOn, value: scene })),
    options.concurrency,
    async (scene) => {
      const { createHash } = await import('node:crypto');
      const inputHashes = options.local ? await Promise.all(scene.inputs.map(fileHash)) : [];
      const specHash = createHash('sha256')
        .update(
          JSON.stringify({
            scene,
            local: options.local,
            fps: board.export?.fps ?? 30,
            inputHashes,
          }),
        )
        .digest('hex');
      const saved = previous[scene.id];
      if (saved?.state === 'completed' && saved.specHash === specHash) {
        const result = z.object({ output: z.string(), sha256: z.string() }).parse(saved.result);
        if ((await fileHash(result.output)) !== result.sha256)
          throw new AppError('CHECKSUM_MISMATCH', `Completed scene ${scene.id} changed on disk.`);
        return saved.result;
      }
      await store.update((state) => {
        state[scene.id] = { state: 'processing', specHash };
      });
      try {
        let result: unknown;
        if (options.local) {
          if (!scene.inputs[0])
            throw new AppError(
              'LOCAL_INPUT_REQUIRED',
              `Scene ${scene.id} needs a pre-existing clip in inputs.`,
              'Local assembly does not generate AI scenes.',
            );
          result = await processMedia(
            'resize',
            {
              input: scene.inputs[0],
              output: scene.output,
              size: scene.size,
              fps: board.export?.fps ?? 30,
              maxFileBytes: options.maxFileBytes,
            },
            options.signal,
          );
        } else {
          const model = options.registry.resolveVideo(scene.model, 'text_to_video');
          const job = await options.jobs.submit(
            options.provider,
            generationSchema.parse({
              operation: 'text_to_video',
              model: model.id,
              prompt: [scene.prompt, scene.style, scene.camera, scene.audio]
                .filter(Boolean)
                .join('\n'),
              seconds: scene.seconds,
              size: scene.size,
              references: scene.references,
            }),
            options.signal,
          );
          const done = await options.jobs.watch(job.id, {
            signal: options.signal,
            timeoutMs: options.timeoutMs,
            intervalMs: options.pollMs,
          });
          if (done.state !== 'completed')
            throw new AppError('SCENE_FAILED', `Scene ${scene.id} did not complete.`);
          result = await options.jobs.download(done.id, scene.output, options.signal);
        }
        await store.update((state) => {
          state[scene.id] = { state: 'completed', result, specHash };
        });
        return result;
      } catch (e) {
        await store.update((state) => {
          state[scene.id] = { state: 'failed', error: errorData(e), specHash };
        });
        throw e;
      }
    },
    options.signal,
  );
  await store.update((state) => {
    for (const [id, result] of Object.entries(results))
      if (result.state !== 'completed') state[id] = { ...state[id], ...result };
  });
  const failed = Object.values(results).some((r) => r.state !== 'completed');
  if (failed)
    throw new AppError(
      'STORYBOARD_FAILED',
      'One or more scenes failed; export was not assembled.',
      'Run storyboard status and correct input errors.',
      results,
    );
  let exported: unknown = null;
  if (board.export) {
    const inputs = [...board.scenes].sort((a, b) => a.order - b.order).map((s) => s.output);
    exported =
      inputs.length > 1
        ? await processMedia(
            'concat',
            { inputs, ...board.export, maxFileBytes: options.maxFileBytes },
            options.signal,
          )
        : await processMedia(
            'resize',
            { input: inputs[0], ...board.export, maxFileBytes: options.maxFileBytes },
            options.signal,
          );
  }
  return {
    mode: options.local ? 'local' : 'generative',
    aiGenerated: !options.local,
    scenes: results,
    export: exported,
  };
}
export function storyboardStatus(root: string) {
  return new JsonStore(root, 'storyboard-status', renderStateSchema, () => ({})).read();
}
