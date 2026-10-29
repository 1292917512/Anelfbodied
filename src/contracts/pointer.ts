import { z } from 'zod';
import type { HitRegion } from '../shared/hit-region';
import type { Bounds, PetPlacement } from '../shared/geometry';

const normalized = z.number().min(0).max(1);
const modelBounds: z.ZodType<Bounds> = z.object({
  x: z.number().min(-4).max(4),
  y: z.number().min(-4).max(4),
  width: z.number().positive().max(8),
  height: z.number().positive().max(8),
});
export const petPlacementSchema: z.ZodType<PetPlacement> = z.object({
  x: normalized,
  y: normalized,
  bounds: modelBounds,
});
export const petDragSchema = z.object({
  grab: z.object({ x: normalized, y: normalized }),
  bounds: modelBounds,
});
export type PetDragRequest = z.infer<typeof petDragSchema>;

const coordinate = z.number().min(-100000).max(100000);
const point = z.object({ x: coordinate, y: coordinate });
const mask = z
  .object({
    width: z.number().int().min(1).max(256),
    height: z.number().int().min(1).max(256),
    bits: z.instanceof(Uint8Array).refine((bits) => bits.length <= 8192),
  })
  .refine((mask) => mask.bits.length === Math.ceil((mask.width * mask.height) / 8));

export const pointerRegionsSchema: z.ZodType<HitRegion[]> = z
  .array(
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('rect'),
        x: coordinate,
        y: coordinate,
        width: z.number().nonnegative().max(100000),
        height: z.number().nonnegative().max(100000),
      }),
      z.object({
        kind: z.literal('model'),
        origin: point,
        horizontal: point,
        vertical: point,
        mask,
      }),
    ]),
  )
  .max(4);
