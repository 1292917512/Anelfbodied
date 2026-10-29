import { petSize } from './pet-size';

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export type Bounds = Point & Size;
export const fullModelBounds: Bounds = { x: 0, y: 0, width: 1, height: 1 };
export interface PetPlacement extends Point {
  bounds: Bounds;
}

/** Converts normalized opacity bounds to viewport coordinates. */
export function visibleModelBounds(anchor: Point, diameter: number, bounds: Bounds): Bounds {
  return {
    x: anchor.x + bounds.x * diameter,
    y: anchor.y + bounds.y * diameter,
    width: bounds.width * diameter,
    height: bounds.height * diameter,
  };
}

/** Fits the model to the work area without reserving space for transient controls. */
export function petDisplaySize(size: Size, scale = 1) {
  const requested = petSize.base * scale;
  const diameter = Math.max(1, Math.min(requested, size.width, size.height));
  return { requested, diameter, limited: diameter < requested };
}
function petRange(size: Size, scale: number, bounds: Bounds) {
  const { diameter } = petDisplaySize(size, scale);
  return {
    left: -bounds.x * diameter,
    top: -bounds.y * diameter,
    width: Math.max(0, size.width - bounds.width * diameter),
    height: Math.max(0, size.height - bounds.height * diameter),
  };
}
export function petAnchor(size: Size, point: Point, scale = 1, bounds = fullModelBounds): Point {
  const range = petRange(size, scale, bounds);
  return {
    x: range.left + range.width * Math.max(0, Math.min(1, point.x)),
    y: range.top + range.height * Math.max(0, Math.min(1, point.y)),
  };
}
export function normalizePet(
  size: Size,
  point: Point,
  scale = 1,
  bounds = fullModelBounds,
): PetPlacement {
  const range = petRange(size, scale, bounds);
  return {
    x: range.width ? Math.max(0, Math.min(1, (point.x - range.left) / range.width)) : 0.5,
    y: range.height ? Math.max(0, Math.min(1, (point.y - range.top) / range.height)) : 0.5,
    bounds,
  };
}

/** Places feedback above, below or beside the model while keeping controls on screen. */
export function bubblePlacement(viewport: Size, body: Bounds, container: Bounds = body) {
  const gap = 12;
  const width = Math.max(1, Math.min(270, viewport.width - gap * 2));
  const left = Math.max(
    gap,
    Math.min(viewport.width - width - gap, body.x + body.width / 2 - width / 2),
  );
  const upperEdge = Math.min(viewport.height - gap, body.y - gap);
  const lowerEdge = Math.max(gap, body.y + body.height + gap);
  const above = upperEdge - gap;
  const below = viewport.height - lowerEdge - gap;
  if (above >= 160 && above >= below)
    return {
      left: left - container.x,
      width,
      bottom: container.y + container.height - upperEdge,
      maxHeight: above,
    };
  if (below >= 160)
    return { left: left - container.x, width, top: lowerEdge - container.y, maxHeight: below };
  const side =
    body.x + body.width + gap + width <= viewport.width - gap
      ? body.x + body.width + gap
      : body.x - width - gap >= gap
        ? body.x - width - gap
        : left;
  const top = Math.max(gap, Math.min(viewport.height - 172, body.y));
  return {
    left: side - container.x,
    width,
    top: top - container.y,
    maxHeight: Math.max(1, viewport.height - top - gap),
  };
}

export function panelAnchor(area: Point & Size, panel: Size, pet: Bounds): Point {
  const left = pet.x - panel.width - 18;
  return {
    x: Math.round(
      Math.max(
        area.x + 12,
        Math.min(
          area.x + area.width - panel.width - 12,
          left >= area.x + 12 ? left : pet.x + pet.width + 18,
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        area.y + 12,
        Math.min(area.y + area.height - panel.height - 12, pet.y + pet.height - panel.height),
      ),
    ),
  };
}
