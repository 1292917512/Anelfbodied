import { maskContains, type HitMask } from '../model/hit-mask';
import type { Bounds } from './geometry';

export interface Point {
  x: number;
  y: number;
}
export type HitRegion =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'model'; origin: Point; horizontal: Point; vertical: Point; mask: HitMask };

/** Compares geometry and opacity samples before publishing pointer regions. */
export function sameHitRegions(previous: HitRegion[], next: HitRegion[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((region, index) => {
    const other = next[index]!;
    if (region.kind === 'rect' && other.kind === 'rect')
      return (
        region.x === other.x &&
        region.y === other.y &&
        region.width === other.width &&
        region.height === other.height
      );
    if (region.kind !== 'model' || other.kind !== 'model') return false;
    for (const point of ['origin', 'horizontal', 'vertical'] as const)
      if (region[point].x !== other[point].x || region[point].y !== other[point].y) return false;
    const a = region.mask,
      b = other.mask;
    return (
      a === b ||
      (a.width === b.width &&
        a.height === b.height &&
        a.bits.length === b.bits.length &&
        a.bits.every((value, i) => value === b.bits[i]))
    );
  });
}

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
