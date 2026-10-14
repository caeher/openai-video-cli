import { describe, expect, it } from 'vitest';
import { ModelRegistry, fresh, documentedModels } from '../../src/registry/index.js';
import {
  OpenAIVideoProvider,
  LegacySoraProvider,
  ProviderRegistry,
} from '../../src/providers/index.js';
import { validateRequest } from '../../src/jobs/index.js';
import { generationSchema } from '../../src/providers/types.js';
import { mockModel, MockVideoProvider } from '../fixtures/mock-provider.js';

describe('capabilities and model registry', () => {
  it('blocks all retired video models even when listed remotely', async () => {
    const registry = new ModelRegistry();
    await registry.discover([{ id: 'sora-2' }]);
    expect(registry.inspect('sora-2').status).toBe('retired');
    expect(() => registry.require('sora-2', 'text_to_video')).toThrow('retired');
    expect(() => registry.resolveVideo('auto', 'text_to_video')).toThrow('No active official');
  });
  it('does not infer unknown video capabilities from discovery', async () => {
    const registry = new ModelRegistry();
    await registry.discover([{ id: 'future-video-123' }]);
    const model = registry.inspect('future-video-123');
    expect(model.availability).toBe('available');
    expect(model.status).toBe('unknown');
    expect(model.capabilities.text_to_video?.status).toBe('unknown');
    expect(() => registry.require(model.id, 'text_to_video')).toThrow('unknown');
  });
  it('honors shutdown dates without upgrading unknown capabilities', async () => {
    const registry = new ModelRegistry();
    await registry.discover([{ id: 'future-video', shutdown_date: '2026-01-01' }]);
    expect(registry.inspect('future-video').status).toBe('retired');
  });
  it('expires supported documentation and future dates', () => {
    expect(fresh('2026-10-14', new Date('2026-11-20'))).toBe(false);
    expect(fresh('2026-10-14', new Date('2026-10-13'))).toBe(false);
    const registry = new ModelRegistry();
    expect(() =>
      registry.require('gpt-6-luna', 'text_optimization', new Date('2026-12-01')),
    ).toThrow('reverification');
  });
  it('active text/image models do not acquire video capabilities', () => {
    expect(
      documentedModels
        .filter((m) => m.status === 'active')
        .every((m) => m.capabilities.text_to_video?.status === 'unsupported'),
    ).toBe(true);
  });
  it('legacy adapters cannot send requests', () => {
    expect(new OpenAIVideoProvider()).not.toHaveProperty('create');
    expect(new LegacySoraProvider()).not.toHaveProperty('create');
  });
  it('validates model-specific parameters and frame support', () => {
    const registry = new ModelRegistry();
    registry.register(mockModel());
    const raw = {
      operation: 'text_to_video',
      model: 'mock-video',
      prompt: 'A forest',
      seconds: 8,
      size: '1280x720',
      orientation: 'landscape',
    };
    expect(() => validateRequest(generationSchema.parse(raw), registry)).not.toThrow();
    expect(() =>
      validateRequest(generationSchema.parse({ ...raw, seconds: 12 }), registry),
    ).toThrow('Duration');
    expect(() =>
      validateRequest(generationSchema.parse({ ...raw, lastFrame: 'last.png' }), registry),
    ).toThrow('not documented');
    expect(() =>
      validateRequest(generationSchema.parse({ ...raw, orientation: 'portrait' }), registry),
    ).toThrow('disagree');
  });
  it('prevents mocks from using the OpenAI identity', () => {
    const provider = new MockVideoProvider();
    Object.defineProperty(provider, 'id', { value: 'openai' });
    expect(() => new ProviderRegistry().register(provider)).toThrow('Mock providers');
  });
});
