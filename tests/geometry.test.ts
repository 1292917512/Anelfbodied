import { describe, expect, it } from 'vitest';
import {
  panelAnchor,
  petAnchor,
  petDisplaySize,
  normalizePet,
  bubblePlacement,
} from '../src/shared/geometry';

describe('floating panel placement', () => {
  it('allows every model size to reach all four work area edges', () => {
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
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.x + diameter).toBeLessThanOrEqual(size.width + 0.001);
            expect(point.y + diameter).toBeLessThanOrEqual(size.height + 0.001);
            if (x === 0) expect(point.x).toBe(0);
            if (y === 0) expect(point.y).toBe(0);
            if (x === 1) expect(point.x + diameter).toBe(size.width);
            if (y === 1) expect(point.y + diameter).toBe(size.height);
            const normalized = normalizePet(size, point, scale);
            const restored = petAnchor(size, normalized, scale);
            expect(restored.x).toBeCloseTo(point.x, 6);
            expect(restored.y).toBeCloseTo(point.y, 6);
          }
  });
  it('keeps feedback usable at the top, bottom and beside oversized models', () => {
    for (const viewport of [
      { width: 800, height: 600 },
      { width: 360, height: 640 },
    ])
      for (const scale of [0.25, 1, 10])
        for (const x of [0, 1])
          for (const y of [0, 1]) {
            const anchor = petAnchor(viewport, { x, y }, scale);
            const diameter = petDisplaySize(viewport, scale).diameter;
            const placement = bubblePlacement(viewport, {
              ...anchor,
              width: diameter,
              height: diameter,
            });
            const left = anchor.x + placement.left;
            const top =
              placement.top === undefined
                ? anchor.y + diameter - placement.bottom! - placement.maxHeight
                : anchor.y + placement.top;
            expect(left).toBeGreaterThanOrEqual(0);
            expect(left + placement.width).toBeLessThanOrEqual(viewport.width);
            expect(top).toBeGreaterThanOrEqual(0);
            expect(top + placement.maxHeight).toBeLessThanOrEqual(viewport.height);
          }
  });
  it('reports screen fitting without changing the requested size', () => {
    const small = petDisplaySize({ width: 800, height: 600 }, 10);
    const large = petDisplaySize({ width: 3840, height: 2160 }, 10);
    expect(small).toMatchObject({ requested: 1400, limited: true });
    expect(large).toEqual({ requested: 1400, diameter: 1400, limited: false });
  });
  it('constrains visible character edges instead of transparent canvas edges', () => {
    const viewport = { width: 800, height: 600 };
    const bounds = { x: 0.35, y: 0.1, width: 0.3, height: 0.8 };
    for (const scale of [1, 10])
      for (const x of [0, 0.5, 1])
        for (const y of [0, 0.5, 1]) {
          const diameter = petDisplaySize(viewport, scale).diameter;
          const anchor = petAnchor(viewport, { x, y }, scale, bounds);
          expect(anchor.x + bounds.x * diameter).toBeCloseTo(
            (viewport.width - bounds.width * diameter) * x,
          );
          expect(anchor.y + bounds.y * diameter).toBeCloseTo(
            (viewport.height - bounds.height * diameter) * y,
          );
          expect(normalizePet(viewport, anchor, scale, bounds)).toEqual({ x, y, bounds });
          const bubble = bubblePlacement(viewport, {
            ...anchor,
            width: diameter,
            height: diameter,
          });
          const top =
            bubble.top === undefined
              ? anchor.y + diameter - bubble.bottom! - bubble.maxHeight
              : anchor.y + bubble.top;
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top + bubble.maxHeight).toBeLessThanOrEqual(viewport.height);
        }
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
