import { z } from 'zod';
import { modelActionName, type ModelAction } from '../protocol/model';
import { petSize } from '../shared/pet-size';

export const assetPath = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (value) =>
      !/[\\:%?#]/.test(value) &&
      [...value].every((char) => char.charCodeAt(0) >= 32) &&
      value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Asset must be a relative path inside the skin folder',
  );
const metadata = {
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(60),
  author: z.string().max(100).default(''),
  license: z.string().max(100).default(''),
};
export const skinSchema = z
  .object({
    version: z.literal(2),
    ...metadata,
    type: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    model: z.unknown(),
    actions: z
      .record(
        modelActionName,
        z
          .object({
            source: modelActionName,
            description: z.string().max(300).default(''),
            durationMs: z.number().int().min(100).max(120000).optional(),
          })
          .strict(),
      )
      .default({}),
    bindings: z.record(modelActionName, modelActionName).default({}),
  })
  .strict();
export const appearanceSchema = z
  .object({ skinId: z.string(), scale: z.number().min(petSize.minScale).max(petSize.maxScale) })
  .strict();
export type SkinManifest = z.infer<typeof skinSchema>;
export interface PreviewImage {
  url: string;
  width: number;
  height: number;
  columns: number;
  frames: number;
}
export interface Skin {
  id: string;
  name: string;
  author: string;
  license: string;
  builtin: boolean;
  linked?: boolean;
  type: string;
  model: unknown;
  actions: ModelAction[];
  bindings: Record<string, string>;
  preview?: PreviewImage;
  notices?: string[];
}
export interface Appearance {
  skinId: string;
  scale: number;
  skins: Skin[];
  types: { id: string; name: string }[];
}
