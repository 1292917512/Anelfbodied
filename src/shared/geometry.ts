export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

function petRange(size: Size, scale: number) {
  const diameter = 140 * scale;
  const top = Math.min(190, Math.max(80, size.height - diameter - 54));
  return {
    top,
    width: Math.max(0, size.width - diameter - 40),
    height: Math.max(0, size.height - top - diameter - 54),
  };
}
export function petAnchor(size: Size, point: Point, scale = 1): Point {
  const range = petRange(size, scale);
  return {
    x: 20 + range.width * point.x,
    y: range.top + range.height * point.y,
  };
}
export function normalizePet(size: Size, point: Point, scale = 1): Point {
  const range = petRange(size, scale);
  return {
    x: (point.x - 20) / Math.max(1, range.width),
    y: (point.y - range.top) / Math.max(1, range.height),
  };
}

export function panelAnchor(area: Point & Size, panel: Size, pet: Point, diameter = 140): Point {
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
