import { readFile } from 'node:fs/promises';
import { InvalidArgumentError, type Command } from 'commander';
import { AppError } from '../errors/index.js';
import { inputPath } from '../utils/files.js';
import { z } from 'zod';
import type { Context } from '../cli/context.js';
import { authorizeCost, type Estimate } from '../cost/index.js';

export const commandOptionsSchema = z
  .object({ json: z.boolean().optional(), nonInteractive: z.boolean().optional() })
  .passthrough();
export type Options = Record<string, unknown> & { json?: boolean; nonInteractive?: boolean };
export const stringOption = (o: Options, key: string) =>
  typeof o[key] === 'string' ? (o[key] as string) : undefined;
export const numberOption = (o: Options, key: string) =>
  typeof o[key] === 'number' ? (o[key] as number) : undefined;
export const boolOption = (o: Options, key: string) => o[key] === true;
export const arrayOption = (o: Options, key: string) =>
  Array.isArray(o[key]) ? z.array(z.string()).parse(o[key]) : [];
export function numberArg(value: string) {
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n))
    throw new InvalidArgumentError('Must be a finite number.');
  return n;
}
export function requiredString(options: Options, key: string) {
  const value = stringOption(options, key);
  if (!value)
    throw new AppError(
      'ARGUMENT_REQUIRED',
      `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required.`,
    );
  return value;
}
export async function promptText(options: Options) {
  const prompt = stringOption(options, 'prompt');
  const file = stringOption(options, 'promptFile');
  if (prompt && file)
    throw new AppError('PROMPT_CONFLICT', 'Use either --prompt or --prompt-file.');
  const text = file ? await readFile(await inputPath(file, 128000), 'utf8') : prompt;
  return z.string().trim().min(1).max(32000).parse(text);
}
export function costOptions(command: Command) {
  return command
    .option('--max-cost <usd>', 'Maximum total estimated cost; rejects unknown cost', numberArg)
    .option('--confirm-cost', 'Explicitly authorize reviewed API cost')
    .option('--allow-unknown-cost', 'Explicitly accept an unknown API charge')
    .option('--dry-run', 'Validate and plan without requests or output writes')
    .option('--new-request', 'Explicitly allow a new paid request instead of duplicate reuse');
}
export async function authorize(context: Context, estimate: Estimate, options: Options) {
  return authorizeCost(estimate, {
    maxCost: numberOption(options, 'maxCost') ?? context.config.budget ?? undefined,
    confirmCost: boolOption(options, 'confirmCost'),
    allowUnknownCost: boolOption(options, 'allowUnknownCost'),
    nonInteractive: options.nonInteractive,
    threshold: context.config.confirmThreshold,
  });
}
