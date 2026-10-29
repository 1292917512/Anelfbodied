import type { Point, Size } from '../../../shared/geometry';

export const wheelSize = 240;
export function wheelPosition(viewport: Size, body: Point & Size): Point {
  const gap = 12;
  const right = body.x + body.width + gap;
  const left = body.x - wheelSize - gap;
  const x =
    right + wheelSize <= viewport.width - gap
      ? right
      : left >= gap
        ? left
        : body.x + body.width / 2 - wheelSize / 2;
  return {
    x: Math.max(gap, Math.min(viewport.width - wheelSize - gap, x)),
    y: Math.max(
      gap,
      Math.min(viewport.height - wheelSize - gap, body.y + body.height / 2 - wheelSize / 2),
    ),
  };
}
