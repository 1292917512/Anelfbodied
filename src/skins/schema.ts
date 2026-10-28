import { z } from 'zod';

export const motionNames = [
  'idle',
  'touch',
  'happy',
  'thinking',
  'sleepy',
  'surprised',
  'move',
  'talk',
] as const;
export type Motion = (typeof motionNames)[number];
const animation = z
  .object({
    file: z.string().regex(/^[a-zA-Z0-9_-]+\.png$/),
    columns: z.number().int().min(1).max(32).default(1),
    frames: z.number().int().min(1).max(256).default(1),
    fps: z.number().min(1).max(30).default(8),
  })
  .strict();
export const skinSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    name: z.string().min(1).max(60),
    author: z.string().max(100).default(''),
    license: z.string().max(100).default(''),
    animations: z
      .object({
        idle: animation,
        touch: animation.optional(),
        happy: animation.optional(),
        thinking: animation.optional(),
        sleepy: animation.optional(),
        surprised: animation.optional(),
        move: animation.optional(),
        talk: animation.optional(),
      })
      .strict(),
  })
  .strict();
export const appearanceSchema = z
  .object({ skinId: z.string(), scale: z.number().min(0.7).max(1.5) })
  .strict();
export type SkinManifest = z.infer<typeof skinSchema>;
export type Sprite = z.infer<typeof animation> & { url: string; width: number; height: number };
export interface Skin {
  id: string;
  name: string;
  author: string;
  license: string;
  builtin: boolean;
  animations: Partial<Record<Motion, Sprite>> & { idle: Sprite };
}
export interface Appearance {
  skinId: string;
  scale: number;
  skins: Skin[];
}
