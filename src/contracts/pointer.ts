import { z } from 'zod';
import type { HitRegion } from '../shared/hit-region';

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
