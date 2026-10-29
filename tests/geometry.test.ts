import { describe, expect, it } from 'vitest';
import { panelAnchor, petAnchor, petDisplaySize, normalizePet } from '../src/shared/geometry';

describe('floating panel placement', () => {
  it('keeps enlarged models, controls and inverse drag coordinates inside each viewport', () => {
    for (const size of [
      { width: 360, height: 640 },
      { width: 800, height: 600 },
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 },
    ])
      for (const scale of [0.25, 1, 3, 7.75, 10])
        for (const x of [0, 0.5, 1])
          for (const y of [0, 0.5, 1]) {
            const point = petAnchor(size, { x, y }, scale);
            const { diameter } = petDisplaySize(size, scale);
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeGreaterThanOrEqual(100);
            expect(point.x + diameter).toBeLessThanOrEqual(size.width + 0.001);
            expect(point.y + diameter + 42).toBeLessThanOrEqual(size.height + 0.001);
            const normalized = normalizePet(size, point, scale);
            const restored = petAnchor(size, normalized, scale);
            expect(restored.x).toBeCloseTo(point.x, 6);
            expect(restored.y).toBeCloseTo(point.y, 6);
          }
  });
  it('reports screen fitting without changing the requested size', () => {
    const small = petDisplaySize({ width: 800, height: 600 }, 10);
    const large = petDisplaySize({ width: 3840, height: 2160 }, 10);
    expect(small).toMatchObject({ requested: 1400, limited: true });
    expect(large).toEqual({ requested: 1400, diameter: 1400, limited: false });
  });
  it('fits all corners on a monitor with a negative desktop origin', () => {
    const area = { x: -1920, y: -200, width: 1920, height: 1080 };
    const panel = { width: 400, height: 600 };
    for (const x of [0, 1])
      for (const y of [0, 1]) {
        const anchor = petAnchor(area, { x, y });
        const point = panelAnchor(area, panel, { x: area.x + anchor.x, y: area.y + anchor.y });
        expect(point.x).toBeGreaterThanOrEqual(area.x);
        expect(point.y).toBeGreaterThanOrEqual(area.y);
        expect(point.x + panel.width).toBeLessThanOrEqual(area.x + area.width);
        expect(point.y + panel.height).toBeLessThanOrEqual(area.y + area.height);
      }
  });
});
