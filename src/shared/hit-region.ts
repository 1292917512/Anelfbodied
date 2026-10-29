import { maskContains, type HitMask } from '../model/hit-mask';
import type { Bounds } from './geometry';

export interface Point {
  x: number;
  y: number;
}
export type HitRegion =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'model'; origin: Point; horizontal: Point; vertical: Point; mask: HitMask };

const spans = new WeakMap<HitMask, Bounds[]>();

/** Measures opaque rows after applying the surface transform, excluding transparent padding. */
export function regionBounds(region: HitRegion): Bounds | undefined {
  if (region.kind === 'rect') return region;
  const { mask, origin, horizontal: h, vertical: v } = region;
  let rows = spans.get(mask);
  if (!rows) {
    rows = [];
    for (let y = 0; y < mask.height; y++) {
      let left = mask.width,
        right = -1;
      for (let x = 0; x < mask.width; x++) {
        const index = y * mask.width + x;
        if (mask.bits[index >> 3]! & (1 << (index & 7))) {
          left = Math.min(left, x);
          right = x;
        }
      }
      if (right >= left)
        rows.push({
          x: left / mask.width,
          y: y / mask.height,
          width: (right - left + 1) / mask.width,
          height: 1 / mask.height,
        });
    }
    spans.set(mask, rows);
  }
  if (!rows.length) return;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const row of rows)
    for (const u of [row.x, row.x + row.width])
      for (const w of [row.y, row.y + row.height]) {
        const x = origin.x + h.x * u + v.x * w;
        const y = origin.y + h.y * u + v.y * w;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

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
