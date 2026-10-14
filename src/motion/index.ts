import { z } from 'zod';
import sharp from 'sharp';
import { inspectImage } from '../media/index.js';
import { AppError } from '../errors/index.js';

const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const motionSchema = z.strictObject({
  version: z.literal(1).default(1),
  image: z.string().min(1),
  mask: z.string().optional(),
  prompt: z.string().min(1).max(4000),
  regions: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        polygon: z.array(point).min(3),
        controlPoints: z.array(point).default([]),
        vector: z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]).optional(),
        intensity: z.string().optional(),
        description: z.string().min(1),
      }),
    )
    .default([]),
  stationary: z.array(z.string()).default([]),
});
export type MotionSpec = z.infer<typeof motionSchema>;
export async function validateMotion(raw: unknown) {
  const spec = motionSchema.parse(raw);
  const image = await inspectImage(spec.image);
  const ids = spec.regions.map((r) => r.id);
  if (new Set(ids).size !== ids.length)
    throw new AppError('DUPLICATE_REGION', 'Region IDs must be unique.');
  if (spec.mask) {
    const mask = await inspectImage(spec.mask);
    if (mask.format !== 'png' || mask.width !== image.width || mask.height !== image.height)
      throw new AppError('MASK_DIMENSIONS', 'Mask must be a PNG matching the source dimensions.');
    const stats = await sharp(mask.path).stats();
    if (stats.channels.every((c) => c.min === c.max))
      throw new AppError('EMPTY_MASK', 'Mask must contain spatial variation.');
  }
  return {
    valid: true,
    spec,
    image,
    nativeSupported: false,
    warning:
      'Motion masks, polygons and vectors are local metadata. Textual approximation cannot guarantee spatial compliance.',
    textualPrompt: [
      spec.prompt,
      ...spec.regions.map(
        (r) =>
          `Region ${r.id}: ${r.description}${r.intensity ? `; intensity ${r.intensity}` : ''}.`,
      ),
      ...(spec.stationary.length ? [`Keep stationary: ${spec.stationary.join(', ')}.`] : []),
    ].join('\n'),
  };
}
