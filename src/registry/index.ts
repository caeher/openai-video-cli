import { z } from 'zod';
import type { CapabilityName, Model } from './types.js';
import { capabilityNames, modelSchema } from './types.js';
import { AppError } from '../errors/index.js';
import { JsonStore } from '../storage/index.js';

export const verifiedAt = '2026-10-14';
export const sources = {
  deprecations: 'https://developers.openai.com/api/docs/deprecations',
  models: 'https://developers.openai.com/api/docs/models',
  images: 'https://developers.openai.com/api/reference/resources/images/methods/generate',
  text: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
  pricing: 'https://developers.openai.com/api/docs/pricing',
};
export function fresh(date: string, now = new Date()) {
  const age = now.getTime() - new Date(date).getTime();
  return age >= 0 && age <= 30 * 86400000;
}

function entry(
  id: string,
  status: Model['status'],
  supported: CapabilityName[],
  source: string,
): Model {
  return modelSchema.parse({
    id,
    name: id,
    provider: 'openai',
    status,
    capabilities: Object.fromEntries(
      capabilityNames.map((cap) => [
        cap,
        {
          status: supported.includes(cap)
            ? 'supported'
            : status === 'unknown'
              ? 'unknown'
              : 'unsupported',
          source,
          verifiedAt,
          constraints:
            status === 'retired'
              ? ['Videos API shut down on 2026-09-24; no documented replacement.']
              : [
                  'Account access must be verified independently.',
                  'Documentation expires after 30 days; reverify before paid use.',
                ],
          parameters:
            cap === 'image_generation' && supported.includes(cap)
              ? ['model', 'prompt', 'size', 'quality', 'n', 'output_format']
              : cap === 'text_optimization' && supported.includes(cap)
                ? ['model', 'input', 'instructions', 'max_output_tokens', 'store']
                : [],
        },
      ]),
    ),
    sizes: supported.includes('image_generation') ? ['1024x1024', '1536x1024', '1024x1536'] : [],
    durations: [],
    formats: supported.includes('image_generation') ? ['png'] : [],
    restrictions:
      status === 'retired' ? ['Historical record only; adapter never makes HTTP requests.'] : [],
    price: null,
    verifiedAt,
    source,
    shutdownDate: status === 'retired' ? '2026-09-24' : null,
  });
}

export const documentedModels: Model[] = [
  ...[
    'sora-2',
    'sora-2-pro',
    'sora-2-2025-10-06',
    'sora-2-2025-12-08',
    'sora-2-pro-2025-10-06',
  ].map((id) => entry(id, 'retired', [], sources.deprecations)),
  ...['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'].map((id) =>
    entry(id, 'active', ['image_generation'], sources.images),
  ),
  entry('gpt-6-luna', 'active', ['text_optimization'], sources.text),
];

export class ModelRegistry {
  private models = new Map(documentedModels.map((m) => [m.id, structuredClone(m)]));
  constructor(readonly cache?: JsonStore<Model[]>) {}
  register(model: Model) {
    this.models.set(model.id, modelSchema.parse(model));
  }
  list() {
    return [...this.models.values()].map((m) => structuredClone(m));
  }
  inspect(id: string): Model {
    const model = this.models.get(id);
    if (!model) return entry(id, 'unknown', [], sources.models);
    return structuredClone(model);
  }
  async load() {
    if (this.cache)
      for (const m of await this.cache.read()) {
        const known = this.models.get(m.id);
        const reviewed = known ?? entry(m.id, 'unknown', [], sources.models);
        this.models.set(m.id, {
          ...reviewed,
          shutdownDate: reviewed.shutdownDate ?? m.shutdownDate,
          availability: m.availability,
          availabilityCheckedAt: m.availabilityCheckedAt,
        });
      }
  }
  async discover(remote: { id: string; shutdown_date?: string | null }[], now = new Date()) {
    const ids = new Set(remote.map((m) => m.id));
    for (const item of remote) {
      const model = this.inspect(item.id);
      if (item.shutdown_date) {
        model.shutdownDate = item.shutdown_date;
        if (item.shutdown_date <= now.toISOString().slice(0, 10)) model.status = 'retired';
        else if (model.status !== 'retired') model.status = 'deprecated';
      }
      model.availability = model.status === 'retired' ? 'unavailable' : 'available';
      model.availabilityCheckedAt = now.toISOString();
      this.register(model);
    }
    for (const m of this.models.values())
      if (!ids.has(m.id)) {
        m.availability = 'unavailable';
        m.availabilityCheckedAt = now.toISOString();
      }
    if (this.cache)
      await this.cache.update((state) => {
        state.splice(0, state.length, ...this.list());
      });
    return this.list();
  }
  require(id: string, capability: CapabilityName, now = new Date()) {
    const model = this.inspect(id);
    if (
      model.status === 'retired' ||
      (model.shutdownDate && model.shutdownDate <= now.toISOString().slice(0, 10))
    )
      throw new AppError(
        'MODEL_RETIRED',
        `${id} and its video API are retired.`,
        'Use prompt, storyboard or media commands; monitor official documentation for a replacement.',
        { source: model.source },
      );
    const cap = model.capabilities[capability];
    if (!cap || cap.status !== 'supported')
      throw new AppError(
        'CAPABILITY_UNAVAILABLE',
        `${capability} is ${cap?.status ?? 'unknown'} for ${id}. No supported OpenAI video API is documented.`,
        'Run capabilities; use local planning or FFmpeg media commands.',
        { source: cap?.source ?? model.source },
      );
    if (!fresh(cap.verifiedAt, now))
      throw new AppError(
        'DOCUMENTATION_STALE',
        `Capability documentation for ${id} requires reverification.`,
        'Update the package or register newly reviewed official metadata through the library API.',
      );
    if (model.availability === 'unavailable')
      throw new AppError(
        'MODEL_UNAVAILABLE',
        `Your account does not list ${id}.`,
        'Run models list --refresh and check account access.',
      );
    return model;
  }
  resolveVideo(id: string, capability: CapabilityName) {
    if (id !== 'auto') return this.require(id, capability);
    const candidate = this.list().find(
      (m) => m.status === 'active' && m.capabilities[capability]?.status === 'supported',
    );
    if (!candidate)
      throw new AppError(
        'NO_ACTIVE_VIDEO_API',
        'No active official OpenAI video generation API has been verified. Sora 2 and Videos API were retired on 2026-09-24.',
        'Use prompt, storyboard, image generate or media commands. Check the official deprecations and changelog pages.',
        { source: sources.deprecations },
      );
    return this.require(candidate.id, capability);
  }
}
export function registryCache(root: string) {
  return new JsonStore(root, 'models', z.array(modelSchema), () => []);
}
