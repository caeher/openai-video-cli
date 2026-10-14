import { z } from 'zod';
import { confirm } from '@inquirer/prompts';
import { randomUUID } from 'node:crypto';
import { JsonStore } from '../storage/index.js';
import { AppError } from '../errors/index.js';
import { fresh, sources, verifiedAt } from '../registry/index.js';

export interface Estimate {
  currency: 'USD';
  amount: number | null;
  upperBound: number | null;
  basis: string;
  source: string;
  verifiedAt: string;
}
export const optimizeInstructions =
  'Rewrite the user description as a clear natural-language audiovisual prompt. Preserve intent. Describe subject, scene, action, camera, lighting and sequence. Do not invent API parameters, special syntax or capability promises. Output only the prompt.';
export function estimateCost(input: {
  model: string;
  seconds?: number;
  size?: string;
  quantity?: number;
  regenerations?: number;
  mode?: 'native' | 'local';
  prompt?: string;
  maxOutputTokens?: number;
}): Estimate {
  const quantity = z
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(input.quantity ?? 1);
  const regenerations = z
    .number()
    .int()
    .min(0)
    .max(100)
    .parse(input.regenerations ?? 0);
  const base = { currency: 'USD' as const, source: sources.pricing, verifiedAt };
  if (input.mode === 'local')
    return {
      ...base,
      amount: 0,
      upperBound: 0,
      basis: 'Local processing: no API charge. Compute and electricity excluded.',
    };
  if (input.model === 'gpt-6-luna' && input.prompt !== undefined && fresh(verifiedAt)) {
    const inputBound = Buffer.byteLength(input.prompt + optimizeInstructions, 'utf8') + 1024;
    const output = z
      .number()
      .int()
      .min(1)
      .max(8192)
      .parse(input.maxOutputTokens ?? 1024);
    // Conservative byte-level token ceiling, highest documented context/cache write rates.
    const upperBound =
      ((inputBound * 0.25 + output * 0.75) / 1000000) * quantity * (1 + regenerations);
    return {
      ...base,
      amount: null,
      upperBound,
      basis:
        'Conservative planning bound using UTF-8 byte count plus overhead and maximum output tokens. Actual token usage is recorded; estimates are not provider billing guarantees.',
    };
  }
  return {
    ...base,
    amount: null,
    upperBound: null,
    basis: `Unknown current request cost for ${input.model}. Duration/resolution do not establish current pricing. Historical Sora rates are excluded.`,
  };
}
export interface CostAuthorization {
  maxCost?: number;
  confirmCost?: boolean;
  allowUnknownCost?: boolean;
  nonInteractive?: boolean;
  threshold?: number;
}
export async function authorizeCost(estimate: Estimate, options: CostAuthorization) {
  const limit = options.maxCost;
  if (limit !== undefined) z.number().nonnegative().finite().parse(limit);
  const bound = estimate.upperBound ?? estimate.amount;
  if (bound === null) {
    if (limit !== undefined)
      throw new AppError(
        'COST_LIMIT_UNVERIFIABLE',
        'A numeric budget cannot be enforced for an operation with unknown cost.',
        'Use a provider-side spending limit. Explicitly remove the CLI budget and pass --allow-unknown-cost --confirm-cost only if you accept unknown charges.',
      );
    if (!options.allowUnknownCost)
      throw new AppError(
        'COST_UNKNOWN',
        'Request cost is unknown.',
        'Use --allow-unknown-cost and explicit cost confirmation, or inspect cost estimate first.',
      );
  } else if (limit !== undefined && bound > limit)
    throw new AppError(
      'BUDGET_EXCEEDED',
      `Estimated bound $${bound.toFixed(6)} exceeds $${limit}.`,
    );
  const requires = bound === null || bound >= (options.threshold ?? 1);
  if (!requires || options.confirmCost) return;
  if (options.nonInteractive || !process.stdin.isTTY)
    throw new AppError(
      'COST_CONFIRMATION_REQUIRED',
      'Explicit cost authorization is required in non-interactive mode.',
      'Pass --confirm-cost after reviewing the estimate.',
    );
  if (
    !(await confirm({
      message:
        bound === null
          ? 'Authorize this request with unknown API cost?'
          : `Authorize an estimated bound of $${bound.toFixed(6)}?`,
      default: false,
    }))
  )
    throw new AppError('COST_DECLINED', 'API request was not authorized.');
}

const chargeSchema = z.strictObject({
  id: z.string(),
  operationId: z.string(),
  model: z.string(),
  amount: z.number().nonnegative().nullable(),
  usage: z.unknown(),
  createdAt: z.string(),
  source: z.string(),
  priceVerifiedAt: z.string(),
});
export class CostLedger {
  readonly store: JsonStore<z.infer<typeof chargeSchema>[]>;
  constructor(root: string) {
    this.store = new JsonStore(root, 'costs', z.array(chargeSchema), () => []);
  }
  async record(operationId: string, model: string, usage: unknown) {
    let amount: number | null = null;
    if (fresh(verifiedAt) && usage && typeof usage === 'object') {
      if (model === 'gpt-6-luna') {
        const data = z
          .object({ input_tokens: z.number(), output_tokens: z.number() })
          .safeParse(usage);
        if (data.success)
          amount = (data.data.input_tokens * 0.1 + data.data.output_tokens * 0.5) / 1000000;
      } else if (['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'].includes(model)) {
        const data = z
          .object({
            input_tokens_details: z.object({ text_tokens: z.number(), image_tokens: z.number() }),
            output_tokens: z.number(),
          })
          .safeParse(usage);
        if (data.success)
          amount =
            (data.data.input_tokens_details.text_tokens * 5 +
              data.data.input_tokens_details.image_tokens * 8 +
              data.data.output_tokens * 30) /
            1000000;
      }
    }
    await this.store.update((rows) => {
      if (!rows.some((r) => r.operationId === operationId))
        rows.push({
          id: randomUUID(),
          operationId,
          model,
          amount,
          usage,
          createdAt: new Date().toISOString(),
          source: sources.pricing,
          priceVerifiedAt: verifiedAt,
        });
    });
  }
  async report() {
    const charges = await this.store.read();
    return {
      currency: 'USD',
      knownTotal: charges.reduce((total, row) => total + (row.amount ?? 0), 0),
      unknownCharges: charges.filter((r) => r.amount === null).length,
      charges,
      basis:
        'Measured usage priced at documented standard rates, not an invoice. Cache discounts, context premiums and account-specific billing may differ.',
    };
  }
}
