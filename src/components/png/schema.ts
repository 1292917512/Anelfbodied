import { z } from 'zod';
import { assetPath, skinSchema, type SkinManifest } from '../../model/schema';

export const animationSchema = z
  .object({
    file: assetPath,
    columns: z.number().int().min(1).max(32).default(1),
    frames: z.number().int().min(1).max(256).default(1),
    fps: z.number().min(1).max(60).default(8),
  })
  .strict();
export type Sprite = z.infer<typeof animationSchema> & {
  url: string;
  width: number;
  height: number;
};
export interface PngModel {
  animations: Record<string, Sprite>;
  aliases: Record<string, string>;
}

/** Reads version 1 skin packs without modifying their files. */
export function normalizePngManifest(input: unknown): SkinManifest | undefined {
  if (typeof input !== 'object' || input === null || !('version' in input) || input.version !== 1)
    return;
  const { animations, ...old } = z
    .object({
      version: z.literal(1),
      id: skinSchema.shape.id,
      name: skinSchema.shape.name,
      author: skinSchema.shape.author,
      license: skinSchema.shape.license,
      animations: z.record(z.string(), animationSchema),
    })
    .strict()
    .parse(input);
  if (!animations.idle) throw new Error('PNG 皮肤缺少 idle 动画');
  return skinSchema.parse({ ...old, version: 2, type: 'png', model: { animations } });
}
