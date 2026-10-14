import OpenAI from 'openai';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { AppError, errorData } from '../errors/index.js';
import { JsonStore } from '../storage/index.js';
import { ModelRegistry } from '../registry/index.js';
import { CostLedger, optimizeInstructions } from '../cost/index.js';
import { atomicWrite, fileHash, outputPath } from '../utils/files.js';
import { retry } from '../utils/retry.js';

export function openAIClient(timeoutMs = 120000) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new AppError(
      'API_KEY_MISSING',
      'OPENAI_API_KEY is not set.',
      'Export it in your shell or configure a secret manager. Never save it in project JSON.',
    );
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    timeout: timeoutMs,
    maxRetries: 0,
  });
}
const operationSchema = z.strictObject({
  id: z.string(),
  key: z.string(),
  model: z.string(),
  state: z.enum(['reserved', 'completed', 'uncertain']),
  result: z.unknown().nullable(),
  usage: z.unknown().nullable(),
  error: z.unknown().nullable(),
  createdAt: z.string(),
});
export class ApiOperations {
  readonly store: JsonStore<z.infer<typeof operationSchema>[]>;
  constructor(
    root: string,
    readonly ledger: CostLedger,
  ) {
    this.store = new JsonStore(root, 'api-operations', z.array(operationSchema), () => []);
  }
  async run<T>(
    model: string,
    payload: unknown,
    fn: () => Promise<{ result: T; usage: unknown }>,
    newRequest = false,
  ): Promise<T> {
    const key = createHash('sha256').update(JSON.stringify({ model, payload })).digest('hex');
    const claim = await this.store.update((rows) => {
      const previous = !newRequest && rows.find((row) => row.key === key);
      if (previous) return { row: structuredClone(previous), reused: true };
      const row: z.infer<typeof operationSchema> = {
        id: randomUUID(),
        key,
        model,
        state: 'reserved',
        result: null,
        usage: null,
        error: null,
        createdAt: new Date().toISOString(),
      };
      rows.push(row);
      return { row, reused: false };
    });
    if (claim.reused) {
      if (claim.row.state !== 'completed')
        throw new AppError(
          'SUBMISSION_UNCERTAIN',
          `Operation ${claim.row.id} is reserved or uncertain.`,
          'Check provider billing before passing --new-request.',
        );
      await this.ledger.record(claim.row.id, model, claim.row.usage);
      return claim.row.result as T;
    }
    let completed: { result: T; usage: unknown };
    try {
      completed = await fn();
      const { result, usage } = completed;
      await this.store.update((rows) => {
        Object.assign(
          rows.find((r) => r.id === claim.row.id)!,
          { state: 'completed', result, usage },
        );
      });
    } catch (e) {
      await this.store.update((rows) => {
        Object.assign(
          rows.find((r) => r.id === claim.row.id)!,
          { state: 'uncertain', error: errorData(e) },
        );
      });
      throw new AppError(
        'SUBMISSION_UNCERTAIN',
        `Operation ${claim.row.id} failed; remote acceptance may be unknown.`,
        'Inspect provider records before creating a new request.',
        errorData(e),
      );
    }
    // A ledger failure must not turn a known completed request into uncertain acceptance.
    await this.ledger.record(claim.row.id, model, completed.usage);
    return completed.result;
  }
}

export const imageRequestSchema = z.strictObject({
  model: z.enum(['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']),
  prompt: z.string().min(1).max(32000),
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024'),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  output: z.string().min(1),
  images: z.array(z.string()).max(16).default([]),
});
export class OpenAIAssets {
  constructor(
    readonly client: OpenAI,
    readonly registry: ModelRegistry,
    readonly operations: ApiOperations,
  ) {}
  async discover(signal: AbortSignal) {
    const page = await retry(() => this.client.models.list({ signal }), { signal });
    const models: { id: string; shutdown_date?: string | null }[] = [];
    for await (const model of page) models.push(model);
    return this.registry.discover(models);
  }
  async image(raw: z.input<typeof imageRequestSchema>, signal: AbortSignal, newRequest = false) {
    const request = imageRequestSchema.parse(raw);
    this.registry.require(request.model, 'image_generation');
    if (request.images.length)
      throw new AppError(
        'IMAGE_EDIT_UNAVAILABLE',
        'This adapter exposes image generation only.',
        'Do not confuse image editing references with video character or frame references.',
      );
    const output = resolve(request.output);
    const result = await this.operations.run(
      request.model,
      { ...request, output },
      async () => {
        await outputPath(output);
        const response = await this.client.images.generate(
          {
            model: request.model,
            prompt: request.prompt,
            size: request.size,
            quality: request.quality,
            n: 1,
            output_format: 'png',
          },
          { signal },
        );
        const encoded = response.data?.[0]?.b64_json;
        if (
          !encoded ||
          encoded.length > 100 * 1024 * 1024 ||
          !/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)
        )
          throw new AppError(
            'INVALID_API_RESPONSE',
            'Images API returned no valid bounded base64 image.',
          );
        const bytes = Buffer.from(encoded, 'base64');
        const meta = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
        if (meta.format !== 'png' || `${meta.width}x${meta.height}` !== request.size)
          throw new AppError(
            'INVALID_API_RESPONSE',
            'Image output format or dimensions do not match the request.',
          );
        await atomicWrite(output, bytes, false);
        return {
          result: {
            mode: 'openai',
            output,
            model: request.model,
            format: 'png',
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
          usage: response.usage ?? null,
        };
      },
      newRequest,
    );
    if ((await fileHash(result.output)) !== result.sha256)
      throw new AppError(
        'CHECKSUM_MISMATCH',
        'Stored generated image changed on disk.',
        'Recover the original file or choose a new output and explicitly authorize a new request.',
      );
    return result;
  }
  async optimize(
    prompt: string,
    model: string,
    maxOutputTokens: number,
    signal: AbortSignal,
    newRequest = false,
  ) {
    this.registry.require(model, 'text_optimization');
    z.string().min(1).max(32000).parse(prompt);
    z.number().int().min(1).max(8192).parse(maxOutputTokens);
    return this.operations.run(
      model,
      { prompt, maxOutputTokens, instructions: optimizeInstructions },
      async () => {
        const response = await this.client.responses.create(
          {
            model,
            input: prompt,
            instructions: optimizeInstructions,
            max_output_tokens: maxOutputTokens,
            store: false,
          },
          { signal },
        );
        if (response.status !== 'completed' || !response.output_text)
          throw new AppError(
            'INCOMPLETE_RESPONSE',
            'Prompt optimization did not complete with text.',
            'Inspect the operation before requesting another optimization.',
          );
        return {
          result: { mode: 'openai', model, text: response.output_text },
          usage: response.usage ?? null,
        };
      },
      newRequest,
    );
  }
}
