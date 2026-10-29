import { petSize } from './pet-size';

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

/** Fits the model to the work area without reserving space for transient controls. */
export function petDisplaySize(size: Size, scale = 1) {
  const requested = petSize.base * scale;
  const diameter = Math.max(1, Math.min(requested, size.width, size.height));
  return { requested, diameter, limited: diameter < requested };
}
function petRange(size: Size, scale: number) {
  const { diameter } = petDisplaySize(size, scale);
  return {
    width: Math.max(0, size.width - diameter),
    height: Math.max(0, size.height - diameter),
  };
}
export function petAnchor(size: Size, point: Point, scale = 1): Point {
  const range = petRange(size, scale);
  return {
    x: range.width * Math.max(0, Math.min(1, point.x)),
    y: range.height * Math.max(0, Math.min(1, point.y)),
  };
}
export function normalizePet(size: Size, point: Point, scale = 1): Point {
  const range = petRange(size, scale);
  return {
    x: range.width ? Math.max(0, Math.min(1, point.x / range.width)) : 0.5,
    y: range.height ? Math.max(0, Math.min(1, point.y / range.height)) : 0.5,
  };
}

/** Places feedback above, below or beside the model while keeping controls on screen. */
export function bubblePlacement(viewport: Size, body: Point & Size) {
  const gap = 12;
  const width = Math.max(1, Math.min(270, viewport.width - gap * 2));
  const left = Math.max(
    gap,
    Math.min(viewport.width - width - gap, body.x + body.width / 2 - width / 2),
  );
  const above = body.y - gap * 2;
  const below = viewport.height - body.y - body.height - gap * 2;
  if (above >= 160 && above >= below)
    return { left: left - body.x, width, bottom: body.height + gap, maxHeight: above };
  if (below >= 160) return { left: left - body.x, width, top: body.height + gap, maxHeight: below };
  const side =
    body.x + body.width + gap + width <= viewport.width - gap
      ? body.x + body.width + gap
      : body.x - width - gap >= gap
        ? body.x - width - gap
        : left;
  const top = Math.max(gap, Math.min(viewport.height - 172, body.y));
  return {
    left: side - body.x,
    width,
    top: top - body.y,
    maxHeight: Math.max(1, viewport.height - top - gap),
  };
}

export function panelAnchor(
  area: Point & Size,
  panel: Size,
  pet: Point,
  diameter: number = petSize.base,
): Point {
  const left = pet.x - panel.width - 18;
  return {
    x: Math.round(
      Math.max(
        area.x + 12,
        Math.min(
          area.x + area.width - panel.width - 12,
          left >= area.x + 12 ? left : pet.x + diameter + 18,
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        area.y + 12,
        Math.min(area.y + area.height - panel.height - 12, pet.y + diameter - panel.height),
      ),
    ),
  };
}
