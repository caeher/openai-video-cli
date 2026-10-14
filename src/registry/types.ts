import { z } from 'zod';

export const capabilityNames = [
  'text_to_video',
  'image_to_video',
  'video_edit',
  'video_extension',
  'video_remix',
  'character_reference',
  'multi_reference',
  'first_frame',
  'last_frame',
  'regional_motion',
  'audio_generation',
  'batch_generation',
  'image_generation',
  'text_optimization',
] as const;
export const capabilityNameSchema = z.enum(capabilityNames);
export type CapabilityName = (typeof capabilityNames)[number];
export const capabilitySchema = z.strictObject({
  status: z.enum(['supported', 'unsupported', 'unknown']),
  source: z.string().url(),
  verifiedAt: z.string().date(),
  constraints: z.array(z.string()),
  parameters: z.array(z.string()),
});
export const modelSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  provider: z.string(),
  status: z.enum(['active', 'deprecated', 'retired', 'unknown']),
  capabilities: z.record(capabilityNameSchema, capabilitySchema),
  sizes: z.array(z.string()),
  durations: z.array(z.number()),
  formats: z.array(z.string()),
  restrictions: z.array(z.string()),
  price: z.number().nonnegative().nullable(),
  verifiedAt: z.string().date(),
  source: z.string().url(),
  shutdownDate: z.string().date().nullable(),
  availability: z.enum(['available', 'unavailable', 'unknown']).default('unknown'),
  availabilityCheckedAt: z.string().nullable().default(null),
});
export type Capability = z.infer<typeof capabilitySchema>;
export type Model = z.infer<typeof modelSchema>;
