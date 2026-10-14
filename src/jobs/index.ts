import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { JsonStore } from '../storage/index.js';
import {
  generationSchema,
  jobStates,
  remoteJobSchema,
  type GenerationRequest,
  type RemoteJob,
} from '../providers/types.js';
import { ModelRegistry } from '../registry/index.js';
import { ProviderRegistry } from '../providers/index.js';
import { AppError, errorData } from '../errors/index.js';
import { retry } from '../utils/retry.js';
import { download } from '../utils/download.js';
import { inspectMedia } from '../media/index.js';

export const jobSchema = z.strictObject({
  id: z.string(),
  provider: z.string(),
  mock: z.boolean(),
  state: z.enum(jobStates),
  remoteId: z.string().nullable(),
  request: generationSchema,
  fingerprint: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  submission: z.enum(['reserved', 'accepted', 'uncertain']),
  progress: z.number().min(0).max(100).nullable(),
  error: z.unknown().nullable(),
  output: z.string().nullable(),
  sha256: z.string().nullable(),
  parentJobId: z.string().nullable(),
  localCancellation: z.boolean(),
  remoteCancellation: z.boolean(),
});
export type Job = z.infer<typeof jobSchema>;
export function fingerprint(request: GenerationRequest, provider: string) {
  return createHash('sha256').update(JSON.stringify({ provider, request })).digest('hex');
}
const terminal = (state: Job['state']) => ['completed', 'failed', 'cancelled'].includes(state);

export class JobManager {
  readonly store: JsonStore<Job[]>;
  constructor(
    root: string,
    readonly registry: ModelRegistry,
    readonly providers: ProviderRegistry,
    readonly maxFileBytes = 536870912,
  ) {
    this.store = new JsonStore(root, 'jobs', z.array(jobSchema), () => []);
  }
  list() {
    return this.store.read();
  }
  async get(id: string) {
    const job = (await this.list()).find((j) => j.id === id);
    if (!job) throw new AppError('JOB_NOT_FOUND', `Job ${id} was not found.`);
    return job;
  }
  private async patch(id: string, values: Partial<Job>) {
    return this.store.update((state) => {
      const job = state.find((j) => j.id === id);
      if (!job) throw new AppError('JOB_NOT_FOUND', `Job ${id} was not found.`);
      Object.assign(job, values, { updatedAt: new Date().toISOString() });
      return structuredClone(job);
    });
  }
  private applyRemote(remote: RemoteJob) {
    return { state: remote.state, progress: remote.progress ?? null, error: remote.error ?? null };
  }
  async submit(
    providerId: string,
    raw: GenerationRequest,
    signal: AbortSignal,
    newRequest = false,
  ): Promise<Job> {
    const request = generationSchema.parse(raw);
    const model = this.registry.require(request.model, request.operation);
    if (model.provider !== providerId)
      throw new AppError('PROVIDER_MODEL_MISMATCH', 'Model and provider identities differ.');
    validateRequest(request, this.registry);
    const provider = this.providers.get(providerId);
    if (!provider.create)
      throw new AppError('OPERATION_UNAVAILABLE', 'Provider does not implement creation.');
    if (request.parentJobId) {
      const parent = await this.get(request.parentJobId);
      if (parent.provider !== providerId)
        throw new AppError('PARENT_PROVIDER_MISMATCH', 'Related jobs must use the same provider.');
    }
    signal.throwIfAborted();
    const key = fingerprint(request, providerId);
    const reserved = await this.store.update((state) => {
      const existing = !newRequest && state.find((j) => j.fingerprint === key);
      if (existing) return { job: structuredClone(existing), reused: true };
      const now = new Date().toISOString();
      const job: Job = {
        id: randomUUID(),
        provider: providerId,
        mock: provider.kind === 'mock',
        state: 'pending',
        remoteId: null,
        request,
        fingerprint: key,
        createdAt: now,
        updatedAt: now,
        submission: 'reserved',
        progress: null,
        error: null,
        output: null,
        sha256: null,
        parentJobId: request.parentJobId ?? null,
        localCancellation: false,
        remoteCancellation: false,
      };
      state.push(job);
      return { job, reused: false };
    });
    if (reserved.reused) return reserved.job;
    try {
      // Persist reservation before the remote request. No automatic creation retry.
      const remote = remoteJobSchema.parse(
        await provider.create(request, { signal, requestId: reserved.job.id }),
      );
      return await this.patch(reserved.job.id, {
        ...this.applyRemote(remote),
        remoteId: remote.id,
        submission: 'accepted',
      });
    } catch (e) {
      await this.patch(reserved.job.id, {
        state: 'failed',
        submission: 'uncertain',
        error: errorData(e),
      });
      throw new AppError(
        'SUBMISSION_UNCERTAIN',
        `Job ${reserved.job.id}: creation failed; remote acceptance may be unknown.`,
        'Inspect provider records before explicitly creating a new request.',
        errorData(e),
      );
    }
  }
  async status(id: string, signal: AbortSignal) {
    const job = await this.get(id);
    if (terminal(job.state) || !job.remoteId || job.localCancellation) return job;
    const provider = this.providers.get(job.provider);
    if (!provider.status)
      throw new AppError('POLLING_UNAVAILABLE', 'Provider has no documented status operation.');
    const remote = remoteJobSchema.parse(
      await retry(() => provider.status!(job.remoteId!, signal), { signal }),
    );
    if (remote.id !== job.remoteId)
      throw new AppError(
        'INVALID_PROVIDER_RESPONSE',
        'Status response identifies a different remote job.',
      );
    return this.patch(id, this.applyRemote(remote));
  }
  async watch(
    id: string,
    options: {
      signal: AbortSignal;
      timeoutMs: number;
      intervalMs: number;
      onUpdate?: (job: Job) => void;
    },
  ) {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)]);
    for (;;) {
      signal.throwIfAborted();
      const job = await this.status(id, signal);
      options.onUpdate?.(job);
      if (terminal(job.state) || job.localCancellation) return job;
      if (!job.remoteId)
        throw new AppError(
          'JOB_UNRECOVERABLE',
          'Job reservation has no remote ID.',
          'Remote acceptance is uncertain; inspect provider records.',
        );
      await delay(options.intervalMs, undefined, { signal });
    }
  }
  async cancel(id: string, signal: AbortSignal, remote = false) {
    const job = await this.get(id);
    if (terminal(job.state)) return job;
    if (remote) {
      const provider = this.providers.get(job.provider);
      if (!provider.cancel || !job.remoteId)
        throw new AppError(
          'REMOTE_CANCEL_UNAVAILABLE',
          'Remote cancellation is not available.',
          'Use local cancellation; remote generation and billing may continue.',
        );
      const result = remoteJobSchema.parse(await provider.cancel(job.remoteId, signal));
      if (result.id !== job.remoteId)
        throw new AppError(
          'INVALID_PROVIDER_RESPONSE',
          'Cancellation response identifies a different remote job.',
        );
      return this.patch(id, {
        ...this.applyRemote(result),
        remoteCancellation: result.state === 'cancelled',
      });
    }
    return this.patch(id, {
      localCancellation: true,
      error: {
        code: 'LOCAL_CANCELLED',
        message: 'Local monitoring stopped. Remote work and billing may continue.',
      },
    });
  }
  async download(
    id: string,
    output: string,
    signal: AbortSignal,
    progress?: (bytes: number, total?: number) => void,
  ) {
    const job = await this.get(id);
    if (job.state !== 'completed')
      throw new AppError('JOB_NOT_COMPLETED', 'Only completed jobs can be downloaded.');
    const provider = this.providers.get(job.provider);
    if (!provider.asset || !job.remoteId)
      throw new AppError('DOWNLOAD_UNAVAILABLE', 'Provider has no active download operation.');
    // Refresh temporary URLs each attempt. Do not persist URLs or signed query credentials.
    const result = await retry(
      async () => {
        const asset = await provider.asset!(job.remoteId!, signal);
        return download(asset, output, signal, this.maxFileBytes, progress);
      },
      { signal },
    );
    try {
      await inspectMedia(result.output, signal);
    } catch (e) {
      const { rm } = await import('node:fs/promises');
      await rm(result.output, { force: true });
      throw e;
    }
    await this.patch(id, { output: result.output, sha256: result.sha256 });
    return result;
  }
}

export function validateRequest(request: GenerationRequest, registry: ModelRegistry) {
  const model = registry.require(request.model, request.operation);
  const parameters = model.capabilities[request.operation]!.parameters;
  const fields = [
    'seconds',
    'size',
    'orientation',
    'image',
    'input',
    'firstFrame',
    'lastFrame',
    'parentJobId',
  ] as const;
  for (const field of fields)
    if (request[field] !== undefined && !parameters.includes(field))
      throw new AppError(
        'PARAMETER_UNSUPPORTED',
        `${field} is not documented for ${request.model}.`,
      );
  if (request.firstFrame) registry.require(request.model, 'first_frame');
  if (request.lastFrame) registry.require(request.model, 'last_frame');
  if (request.references.length > 1) registry.require(request.model, 'multi_reference');
  for (const ref of request.references) {
    registry.require(
      request.model,
      ref.kind === 'character'
        ? 'character_reference'
        : ref.kind === 'first_frame'
          ? 'first_frame'
          : ref.kind === 'last_frame'
            ? 'last_frame'
            : 'image_to_video',
    );
  }
  if (request.references.length && !parameters.includes('references'))
    throw new AppError(
      'PARAMETER_UNSUPPORTED',
      'References are not documented for this operation.',
    );
  if (request.seconds && !model.durations.includes(request.seconds))
    throw new AppError('DURATION_UNSUPPORTED', 'Duration is not supported by this model.');
  if (request.size && !model.sizes.includes(request.size))
    throw new AppError('SIZE_UNSUPPORTED', 'Resolution is not supported by this model.');
  if (request.size && request.orientation) {
    const [w, h] = request.size.split('x').map(Number);
    const actual = w! > h! ? 'landscape' : w! < h! ? 'portrait' : 'square';
    if (actual !== request.orientation)
      throw new AppError('ORIENTATION_MISMATCH', 'Size and orientation disagree.');
  }
}
