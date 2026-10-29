import { maskContains, type HitMask } from '../model/hit-mask';

export interface Point {
  x: number;
  y: number;
}
export type HitRegion =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'model'; origin: Point; horizontal: Point; vertical: Point; mask: HitMask };

/** Inverts the surface transform, including rotation, reflection and nonuniform scale. */
export function regionContains(region: HitRegion, x: number, y: number): boolean {
  if (region.kind === 'rect')
    return (
      x >= region.x && y >= region.y && x < region.x + region.width && y < region.y + region.height
    );
  const { origin, horizontal: h, vertical: v } = region;
  const determinant = h.x * v.y - h.y * v.x;
  if (Math.abs(determinant) < 0.0001) return false;
  const dx = x - origin.x,
    dy = y - origin.y;
  return maskContains(
    region.mask,
    (dx * v.y - dy * v.x) / determinant,
    (h.x * dy - h.y * dx) / determinant,
  );
}
