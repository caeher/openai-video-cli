import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { JsonStore } from '../storage/index.js';
import { AppError } from '../errors/index.js';

export const configSchema = z.strictObject({
  provider: z.literal('openai').default('openai'),
  model: z.string().min(1).default('auto'),
  imageModel: z.string().default('gpt-image-2.5-sunburst'),
  textModel: z.string().default('gpt-6-luna'),
  size: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .default('1280x720'),
  orientation: z.enum(['landscape', 'portrait', 'square']).default('landscape'),
  seconds: z.number().positive().max(600).default(8),
  output: z.string().min(1).default('output'),
  concurrency: z.number().int().min(1).max(16).default(2),
  budget: z.number().nonnegative().nullable().default(null),
  confirmThreshold: z.number().nonnegative().default(1),
  timeoutMs: z.number().int().min(1000).max(3600000).default(120000),
  pollIntervalMs: z.number().int().min(100).max(60000).default(2000),
  maxFileBytes: z.number().int().min(1024).max(2147483648).default(536870912),
});
export type Config = z.infer<typeof configSchema>;
export function stateHome() {
  return resolve(process.env.OAIVIDEO_HOME ?? join(homedir(), '.config', 'oaivideo'));
}
export class Configuration {
  readonly store: JsonStore<Config>;
  constructor(root = stateHome()) {
    this.store = new JsonStore(root, 'config', configSchema, () => configSchema.parse({}));
  }
  load() {
    return this.store.read();
  }
  async set(key: string, raw: string) {
    if (!(key in configSchema.shape))
      throw new AppError(
        'CONFIG_KEY',
        `Unknown configuration key: ${key}`,
        'Use config list. Credentials are only read from OPENAI_API_KEY.',
      );
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      /* string values can be unquoted */
    }
    return this.store.update((state) => {
      const next = configSchema.parse({ ...state, [key]: value });
      Object.assign(state, next);
      return next;
    });
  }
}
