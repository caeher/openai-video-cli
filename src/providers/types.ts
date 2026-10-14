import { z } from 'zod';
import { capabilityNameSchema, type Model } from '../registry/types.js';

export const referenceSchema = z.strictObject({
  kind: z.enum(['image', 'character', 'first_frame', 'last_frame']),
  path: z.string().min(1),
  description: z.string().optional(),
});
export const generationSchema = z.strictObject({
  operation: capabilityNameSchema,
  model: z.string().min(1),
  prompt: z.string().min(1).max(32000),
  seconds: z.number().positive().max(600).optional(),
  size: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .optional(),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  image: z.string().optional(),
  input: z.string().optional(),
  firstFrame: z.string().optional(),
  lastFrame: z.string().optional(),
  references: z.array(referenceSchema).max(16).default([]),
  parentJobId: z.string().optional(),
});
export type GenerationRequest = z.infer<typeof generationSchema>;
export const jobStates = [
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;
export type JobState = (typeof jobStates)[number];
export interface RemoteJob {
  id: string;
  state: JobState;
  progress?: number;
  error?: string;
}
export const remoteJobSchema = z.strictObject({
  id: z.string().min(1),
  state: z.enum(jobStates),
  progress: z.number().min(0).max(100).optional(),
  error: z.string().optional(),
});
export interface DownloadAsset {
  url: string;
  allowedHosts: string[];
  bytes?: number;
  sha256?: string;
  contentTypes: string[];
}
export interface Character {
  id: string;
  name: string;
}

/** Implement methods only when reviewed model metadata declares the corresponding capability. */
export interface VideoProvider {
  readonly id: string;
  readonly kind: 'native' | 'mock';
  models(): Promise<Model[]>;
  create?: (
    request: GenerationRequest,
    context: { signal: AbortSignal; requestId: string },
  ) => Promise<RemoteJob>;
  status?: (id: string, signal: AbortSignal) => Promise<RemoteJob>;
  cancel?: (id: string, signal: AbortSignal) => Promise<RemoteJob>;
  asset?: (id: string, signal: AbortSignal) => Promise<DownloadAsset>;
  batch?: (requests: GenerationRequest[], signal: AbortSignal) => Promise<RemoteJob[]>;
  characters?: {
    create(input: { name: string; video: string }, signal: AbortSignal): Promise<Character>;
    list(signal: AbortSignal): Promise<Character[]>;
    inspect(id: string, signal: AbortSignal): Promise<Character>;
    delete(id: string, signal: AbortSignal): Promise<void>;
  };
}
