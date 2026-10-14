import { AppError } from '../errors/index.js';
import type { VideoProvider } from './types.js';
import { documentedModels, sources } from '../registry/index.js';

export class OpenAIVideoProvider implements VideoProvider {
  readonly id = 'openai';
  readonly kind = 'native' as const;
  async models() {
    return documentedModels.filter((m) => m.id.startsWith('sora-')).map((m) => structuredClone(m));
  }
  // No HTTP method is exposed while no active video API is documented.
}

/** Historical adapter. Deliberately incapable of contacting /v1/videos. */
export class LegacySoraProvider extends OpenAIVideoProvider {
  override readonly id = 'openai' as const;
  readonly historicalEndpoint = '/v1/videos';
  readonly retiredAt = '2026-09-24';
  readonly source = sources.deprecations;
}

export class ProviderRegistry {
  private entries = new Map<string, VideoProvider>();
  constructor() {
    this.register(new OpenAIVideoProvider());
  }
  register(provider: VideoProvider) {
    if (provider.kind === 'mock' && provider.id === 'openai')
      throw new AppError('MOCK_IDENTITY', 'Mock providers cannot use the OpenAI identity.');
    this.entries.set(provider.id, provider);
  }
  get(id: string) {
    const provider = this.entries.get(id);
    if (!provider)
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        `Provider ${id} is not registered.`,
        'Register a reviewed adapter through the library API.',
      );
    return provider;
  }
}
