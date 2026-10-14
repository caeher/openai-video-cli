import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Configuration } from '../../src/config/index.js';
import { JsonStore } from '../../src/storage/index.js';
import { ModelRegistry, registryCache } from '../../src/registry/index.js';
import { ProviderRegistry } from '../../src/providers/index.js';
import { JobManager } from '../../src/jobs/index.js';
import { generationSchema } from '../../src/providers/types.js';
import { MockVideoProvider, mockModel } from '../fixtures/mock-provider.js';
import { signal, temporary } from '../helpers.js';

describe('persistence and recovery', () => {
  it('persists configuration and rejects credential fields', async () => {
    const root = await temporary();
    const configuration = new Configuration(root);
    await configuration.set('concurrency', '4');
    expect((await new Configuration(root).load()).concurrency).toBe(4);
    await expect(configuration.set('apiKey', 'sk-secret')).rejects.toMatchObject({
      code: 'CONFIG_KEY',
    });
    expect(await readFile(join(root, 'config.json'), 'utf8')).not.toContain('sk-secret');
    await expect(configuration.set('concurrency', '0')).rejects.toThrow();
  });
  it('serializes concurrent transactions across store instances', async () => {
    const root = await temporary();
    const schema = z.object({ count: z.number() });
    const a = new JsonStore(root, 'counter', schema, () => ({ count: 0 }));
    const b = new JsonStore(root, 'counter', schema, () => ({ count: 0 }));
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? a : b).update((s) => {
          s.count++;
        }),
      ),
    );
    expect((await a.read()).count).toBe(20);
  });
  it('caches account availability without trusting cached capability claims', async () => {
    const root = await temporary();
    const first = new ModelRegistry(registryCache(root));
    await first.discover([{ id: 'gpt-6-luna' }, { id: 'custom-id' }]);
    const second = new ModelRegistry(registryCache(root));
    await second.load();
    expect(second.inspect('gpt-6-luna').availability).toBe('available');
    expect(second.inspect('sora-2').status).toBe('retired');
    expect(second.inspect('custom-id').capabilities.text_to_video?.status).toBe('unknown');
  });
  it('does not accept new capabilities from a modified discovery cache', async () => {
    const root = await temporary();
    const cache = registryCache(root);
    const forged = mockModel();
    await cache.update((rows) => {
      rows.push(forged);
    });
    const registry = new ModelRegistry(cache);
    await registry.load();
    expect(registry.inspect('mock-video').status).toBe('unknown');
    expect(registry.inspect('mock-video').capabilities.text_to_video?.status).toBe('unknown');
  });
});

async function setup() {
  const root = await temporary();
  const registry = new ModelRegistry();
  registry.register(mockModel());
  const providers = new ProviderRegistry();
  const provider = new MockVideoProvider();
  providers.register(provider);
  const jobs = new JobManager(root, registry, providers);
  const request = generationSchema.parse({
    operation: 'text_to_video',
    model: 'mock-video',
    prompt: 'A forest',
    seconds: 8,
    size: '1280x720',
    orientation: 'landscape',
  });
  return { root, registry, providers, provider, jobs, request };
}
describe('job manager', () => {
  it('marks mock identity, deduplicates, recovers and polls after restart', async () => {
    const { root, registry, providers, provider, jobs, request } = await setup();
    const [first, duplicate] = await Promise.all([
      jobs.submit('mock', request, signal()),
      jobs.submit('mock', request, signal()),
    ]);
    expect(provider.calls).toBe(1);
    expect(first.id).toBe(duplicate.id);
    expect(first.mock).toBe(true);
    const recovered = new JobManager(root, registry, providers);
    const done = await recovered.watch(first.id, {
      signal: signal(),
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(done.state).toBe('completed');
    expect((await recovered.get(first.id)).progress).toBe(100);
  });
  it('persists uncertain acceptance and never resubmits automatically', async () => {
    const { provider, jobs, request } = await setup();
    provider.failCreate = true;
    await expect(jobs.submit('mock', request, signal())).rejects.toMatchObject({
      code: 'SUBMISSION_UNCERTAIN',
    });
    const duplicate = await jobs.submit('mock', request, signal());
    expect(duplicate.submission).toBe('uncertain');
    expect(provider.calls).toBe(1);
    provider.failCreate = false;
    const fresh = await jobs.submit('mock', request, signal(), true);
    expect(fresh.state).toBe('queued');
    expect(provider.calls).toBe(2);
  });
  it('distinguishes local monitoring cancellation from remote cancellation', async () => {
    const { provider, jobs, request } = await setup();
    const job = await jobs.submit('mock', request, signal());
    const stopped = await jobs.cancel(job.id, signal());
    expect(stopped.localCancellation).toBe(true);
    expect(stopped.remoteCancellation).toBe(false);
    expect(provider.jobs.get(job.remoteId!)!.state).toBe('queued');
    const cancelled = await jobs.cancel(job.id, signal(), true);
    expect(cancelled.remoteCancellation).toBe(true);
    expect(cancelled.state).toBe('cancelled');
  });
  it('fails capabilities before contacting a provider', async () => {
    const { jobs, provider, request } = await setup();
    await expect(
      jobs.submit('openai', { ...request, model: 'sora-2' }, signal()),
    ).rejects.toMatchObject({ code: 'MODEL_RETIRED' });
    expect(provider.calls).toBe(0);
  });
  it('enforces polling deadlines without resubmitting generation', async () => {
    const { provider, jobs, request } = await setup();
    const job = await jobs.submit('mock', request, signal());
    provider.status = async (id: string) => ({ id, state: 'processing' });
    await expect(
      jobs.watch(job.id, { signal: signal(), intervalMs: 5, timeoutMs: 40 }),
    ).rejects.toThrow();
    expect(provider.calls).toBe(1);
  });
});
