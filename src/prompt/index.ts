import { z } from 'zod';

const text = z.string().min(1).max(4000);
export const promptFields = [
  'subject',
  'scene',
  'environment',
  'mainAction',
  'secondaryActions',
  'cameraMovement',
  'framing',
  'lens',
  'lighting',
  'colorPalette',
  'visualStyle',
  'temporalSequence',
  'motionPhysics',
  'characterContinuity',
  'audioDescription',
  'dialogue',
  'avoidance',
  'referenceAssets',
  'shotTransitions',
] as const;
export const promptSchema = z
  .strictObject(
    Object.fromEntries(promptFields.map((key) => [key, text.optional()])) as Record<
      (typeof promptFields)[number],
      z.ZodOptional<typeof text>
    >,
  )
  .refine((p) => Boolean(p.subject || p.scene || p.mainAction), {
    message: 'Provide subject, scene or mainAction.',
  });
export type PromptSpec = z.infer<typeof promptSchema>;
export const templates: Record<string, Partial<PromptSpec>> = {
  cinematic: {
    visualStyle: 'Cinematic realism',
    lighting: 'Motivated light with gentle contrast',
    lens: 'Natural perspective and shallow depth of field',
  },
  documentary: {
    visualStyle: 'Observational documentary',
    cameraMovement: 'Subtle handheld movement',
    lighting: 'Available natural light',
  },
  'product-showcase': {
    visualStyle: 'Clean product photography',
    framing: 'Close-up of product details',
    lighting: 'Soft studio lighting',
  },
  anime: {
    visualStyle: 'Hand-drawn anime aesthetic',
    motionPhysics: 'Expressive but coherent motion',
  },
  '3d-animation': {
    visualStyle: 'Detailed stylized 3D animation',
    lighting: 'Soft global illumination',
  },
  nature: { visualStyle: 'Naturalistic wildlife cinematography', lighting: 'Soft outdoor light' },
  architecture: {
    framing: 'Architectural lines and balanced perspective',
    cameraMovement: 'Slow smooth dolly',
  },
  'social-media': {
    framing: 'Strong central subject',
    temporalSequence: 'Clear opening action and concise ending',
  },
  'music-video': {
    visualStyle: 'Expressive music video',
    shotTransitions: 'Transitions aligned with described musical phrases',
  },
  educational: {
    visualStyle: 'Clear educational visualization',
    mainAction: 'Demonstrate one concept with readable visual progression',
  },
  commercial: {
    visualStyle: 'Polished commercial',
    framing: 'Product and message clearly visible',
  },
  'realistic-portrait': {
    framing: 'Natural portrait',
    lens: 'Portrait perspective, soft background',
    lighting: 'Soft window light',
  },
  'action-scene': {
    mainAction: 'A single legible action with a clear beginning and end',
    motionPhysics: 'Plausible momentum and contact',
  },
};
const labels: Record<(typeof promptFields)[number], string> = {
  subject: 'Subject',
  scene: 'Scene',
  environment: 'Environment',
  mainAction: 'Main action',
  secondaryActions: 'Secondary actions',
  cameraMovement: 'Camera movement',
  framing: 'Framing',
  lens: 'Lens and depth of field',
  lighting: 'Lighting',
  colorPalette: 'Color palette',
  visualStyle: 'Visual style',
  temporalSequence: 'Temporal sequence',
  motionPhysics: 'Motion and physics',
  characterContinuity: 'Character continuity',
  audioDescription: 'Audio description',
  dialogue: 'Dialogue',
  avoidance: 'Avoid',
  referenceAssets: 'Reference assets',
  shotTransitions: 'Shot transitions',
};
export function buildPrompt(raw: unknown) {
  const spec = promptSchema.parse(raw);
  return {
    spec,
    text: promptFields
      .filter((key) => spec[key])
      .map((key) => `${labels[key]}: ${spec[key]}.`)
      .join('\n'),
    syntax: 'natural_language',
    warnings: [
      'Descriptions of avoidance, audio, references and spatial motion do not establish native model capabilities.',
      'No active official OpenAI video API is verified. This prompt is a planning artifact.',
    ],
  };
}
export function validatePrompt(raw: unknown) {
  const result = buildPrompt(raw);
  const warnings = [...result.warnings];
  if ((result.spec.mainAction?.split(/[.;]/).length ?? 0) > 5)
    warnings.push('Consider fewer actions per shot for temporal clarity.');
  if (result.spec.dialogue && !result.spec.audioDescription)
    warnings.push('Describe the intended audio context for dialogue.');
  return { valid: true, ...result, warnings };
}
