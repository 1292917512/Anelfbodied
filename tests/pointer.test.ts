import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { alphaMask, maskContains } from '../src/model/hit-mask';
import { regionBounds, regionContains, type HitRegion } from '../src/shared/hit-region';
import { petDragSchema, petPlacementSchema, pointerRegionsSchema } from '../src/contracts/pointer';
import { PointerBoundary } from '../src/host/pointer-boundary';

const cursor = vi.hoisted(() => ({ x: 0, y: 0 }));
vi.mock('electron', () => ({ screen: { getCursorScreenPoint: () => cursor } }));
const mask = alphaMask(
  new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 31, 0, 0, 0, 128]),
  2,
  2,
);
const region: HitRegion = {
  kind: 'model',
  origin: { x: 10, y: 20 },
  horizontal: { x: 100, y: 0 },
  vertical: { x: 0, y: 80 },
  mask,
};
afterEach(() => vi.useRealTimers());

describe('model pointer boundary', () => {
  it('measures visible pixels without transparent padding, including rotated sparse shapes', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (const [x, y] of [
      [3, 1],
      [4, 1],
      [3, 6],
      [4, 6],
    ])
      pixels[(y! * 8 + x!) * 4 + 3] = 255;
    const sparse = alphaMask(pixels, 8, 8);
    const bounds = regionBounds({ ...region, mask: sparse });
    expect(bounds).toEqual({ x: 47.5, y: 30, width: 25, height: 60 });
    expect(
      regionBounds({ ...region, mask: alphaMask(new Uint8ClampedArray(16), 2, 2) }),
    ).toBeUndefined();
    const diagonal = { ...region, horizontal: { x: 100, y: 100 }, vertical: { x: -80, y: 80 } };
    expect(regionBounds(diagonal)).toEqual({ x: -30, y: 20, width: 100, height: 180 });
  });
  it('validates finite visible placement bounds at the IPC boundary', () => {
    const placement = { x: 1, y: 0, bounds: { x: 0.3, y: 0.1, width: 0.4, height: 0.8 } };
    expect(petPlacementSchema.safeParse(placement).success).toBe(true);
    expect(
      petDragSchema.safeParse({ grab: { x: 0.5, y: 0.5 }, bounds: placement.bounds }).success,
    ).toBe(true);
    for (const bounds of [
      { ...placement.bounds, width: 0 },
      { ...placement.bounds, x: NaN },
      { ...placement.bounds, height: Infinity },
    ])
      expect(petPlacementSchema.safeParse({ ...placement, bounds }).success).toBe(false);
  });
  it('excludes transparent holes, faint shadows and coordinates outside the surface', () => {
    expect(maskContains(mask, 0.2, 0.2)).toBe(true);
    expect(maskContains(mask, 0.7, 0.2)).toBe(false);
    expect(maskContains(mask, 0.2, 0.7)).toBe(false);
    expect(maskContains(mask, 0.7, 0.7)).toBe(true);
    for (const x of [-1, 1, Infinity, NaN]) expect(maskContains(mask, x, 0.2)).toBe(false);
  });
  it('keeps opacity aligned with rotated, reflected and stretched surfaces', () => {
    for (const horizontal of [
      { x: 0, y: 80 },
      { x: -200, y: 60 },
    ]) {
      const transformed = { ...region, horizontal, vertical: { x: 120, y: 30 } };
      const point = (u: number, v: number) => ({
        x: 10 + horizontal.x * u + 120 * v,
        y: 20 + horizontal.y * u + 30 * v,
      });
      const hit = point(0.2, 0.2),
        miss = point(0.7, 0.2);
      expect(regionContains(transformed, hit.x, hit.y)).toBe(true);
      expect(regionContains(transformed, miss.x, miss.y)).toBe(false);
    }
    expect(regionContains({ ...region, horizontal: { x: 0, y: 0 } }, 10, 20)).toBe(false);
  });
  it('bounds IPC payloads and rejects truncated masks and non-finite transforms', () => {
    expect(pointerRegionsSchema.safeParse([region]).success).toBe(true);
    for (const invalid of [
      { ...region, mask: { ...mask, bits: new Uint8Array() } },
      { ...region, mask: { ...mask, width: 257 } },
      { ...region, origin: { x: NaN, y: 0 } },
    ])
      expect(pointerRegionsSchema.safeParse([invalid]).success).toBe(false);
    expect(pointerRegionsSchema.safeParse(Array(5).fill(region)).success).toBe(false);
  });
  it('passes empty pixels to the desktop while preserving captured drags and controls', () => {
    vi.useFakeTimers();
    const window = Object.assign(new EventEmitter(), {
      webContents: new EventEmitter(),
      isDestroyed: () => false,
      isVisible: () => true,
      getBounds: () => ({ x: -100, y: 40 }),
      setIgnoreMouseEvents: vi.fn(),
    });
    const boundary = new PointerBoundary(window as unknown as BrowserWindow);
    Object.assign(cursor, { x: -70, y: 80 });
    boundary.setRegions([region]);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    Object.assign(cursor, { x: -20, y: 80 });
    vi.advanceTimersByTime(40);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    boundary.capture(true);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    boundary.capture(false);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    boundary.setRegions([{ kind: 'rect', x: 75, y: 35, width: 20, height: 20 }]);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    window.webContents.emit('render-process-gone');
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    window.emit('closed');
  });
});
