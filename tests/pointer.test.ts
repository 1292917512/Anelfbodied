import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { alphaMask, maskContains } from '../src/model/hit-mask';
import { regionContains, type HitRegion } from '../src/shared/hit-region';
import { pointerRegionsSchema } from '../src/contracts/pointer';
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
