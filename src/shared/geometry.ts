import { petSize } from './pet-size';

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

/** Fits the requested model size while reserving space for feedback and controls. */
export function petDisplaySize(size: Size, scale = 1) {
  const requested = petSize.base * scale;
  const reserve = Math.min(160, size.height / 4);
  const diameter = Math.max(
    1,
    Math.min(requested, (size.width - 40) / 1.24, (size.height - reserve - 94) / 1.24),
  );
  return { requested, diameter, limited: diameter < requested };
}
function petRange(size: Size, scale: number) {
  const { diameter } = petDisplaySize(size, scale);
  const margin = 20 + diameter * 0.12;
  const top =
    Math.min(
      190,
      Math.max(Math.min(160, size.height / 4), size.height - diameter - 54 - margin * 2),
    ) + margin;
  return {
    left: margin,
    top,
    width: Math.max(0, size.width - diameter - margin * 2),
    height: Math.max(0, size.height - top - diameter - 54 - margin),
  };
}
export function petAnchor(size: Size, point: Point, scale = 1): Point {
  const range = petRange(size, scale);
  return {
    x: range.left + range.width * point.x,
    y: range.top + range.height * point.y,
  };
}
export function normalizePet(size: Size, point: Point, scale = 1): Point {
  const range = petRange(size, scale);
  return {
    x: range.width ? (point.x - range.left) / range.width : 0.5,
    y: range.height ? (point.y - range.top) / range.height : 0.5,
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
