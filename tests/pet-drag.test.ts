import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { PetDrag } from '../src/host/pet-drag';
import {
  petAnchor,
  petDisplaySize,
  fullModelBounds,
  type PetPlacement,
} from '../src/shared/geometry';

const native = vi.hoisted(() => ({
  cursor: { x: 600, y: 500 },
  area: { x: 0, y: 0, width: 1920, height: 1040 },
}));
vi.mock('electron', () => ({
  screen: {
    getCursorScreenPoint: () => native.cursor,
    getDisplayNearestPoint: () => ({ workArea: native.area, scaleFactor: 2 }),
  },
}));
afterEach(() => vi.useRealTimers());

function fixture() {
  vi.useFakeTimers();
  native.cursor = { x: 600, y: 500 };
  native.area = { x: 0, y: 0, width: 1920, height: 1040 };
  let bounds = { ...native.area };
  let scale = 1;
  const window = Object.assign(new EventEmitter(), {
    webContents: new EventEmitter(),
    isDestroyed: () => false,
    isVisible: (): boolean => true,
    getBounds: () => bounds,
    setBounds: vi.fn((area) => {
      bounds = { ...area };
    }),
  });
  const position = vi.fn<(point: PetPlacement | null) => void>();
  const capture = vi.fn();
  const drag = new PetDrag(window as unknown as BrowserWindow, () => scale, position, capture);
  return {
    window,
    position,
    capture,
    drag,
    scale: (value: number) => {
      scale = value;
    },
  };
}

describe('native desktop dragging', () => {
  it('does not keep a polling timer when the window is already hidden', () => {
    const { drag, window, capture } = fixture();
    window.isVisible = () => false;
    drag.start({ grab: { x: 0.5, y: 0.5 }, bounds: fullModelBounds });
    expect(vi.getTimerCount()).toBe(0);
    expect(capture).not.toHaveBeenCalledWith(true);
  });

  it('preserves the grabbed point across left, upper and differently scaled work areas', () => {
    const { drag, position, window, scale } = fixture();
    const grab = { x: 0.4, y: 0.3 };
    drag.start({ grab, bounds: fullModelBounds });
    for (const area of [
      { x: -1280, y: 0, width: 1280, height: 984 },
      { x: 0, y: -900, width: 1440, height: 900 },
      { x: 1920, y: -100, width: 1707, height: 920 },
    ]) {
      native.area = area;
      native.cursor = { x: area.x + 500, y: area.y + 450 };
      scale(2);
      vi.advanceTimersByTime(16);
      const point = position.mock.lastCall![0]!;
      const anchor = petAnchor(area, point, 2);
      const diameter = petDisplaySize(area, 2).diameter;
      expect(area.x + anchor.x + grab.x * diameter).toBeCloseTo(native.cursor.x);
      expect(area.y + anchor.y + grab.y * diameter).toBeCloseTo(native.cursor.y);
      expect(window.getBounds()).toEqual(area);
    }
    expect(window.setBounds).toHaveBeenCalledTimes(3);
    drag.stop();
  });

  it('reaches corners and commits the final cursor sample before releasing capture', () => {
    const { drag, position, capture } = fixture();
    drag.start({ grab: { x: 0.5, y: 0.5 }, bounds: fullModelBounds });
    native.cursor = { x: 0, y: 0 };
    vi.advanceTimersByTime(16);
    expect(position.mock.lastCall![0]).toMatchObject({ x: 0, y: 0 });
    native.cursor = { x: 1920, y: 1040 };
    drag.stop(true);
    expect(position.mock.calls.slice(-2)).toEqual([
      [{ x: 1, y: 1, bounds: fullModelBounds }],
      [null],
    ]);
    expect(capture.mock.lastCall).toEqual([false]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows transparent canvas padding past the work area while keeping the character inside', () => {
    const { drag, position, scale } = fixture();
    native.area = { x: -800, y: -600, width: 800, height: 600 };
    const bounds = { x: 0.4, y: 0.1, width: 0.2, height: 0.8 };
    scale(10);
    drag.start({ grab: { x: 0.5, y: 0.5 }, bounds });
    for (const end of [false, true]) {
      native.cursor = { x: end ? 0 : -800, y: end ? 0 : -600 };
      vi.advanceTimersByTime(16);
      const point = position.mock.lastCall![0]!;
      const anchor = petAnchor(native.area, point, 10, point.bounds);
      expect(anchor.x + bounds.x * 600).toBe(end ? 680 : 0);
      expect(anchor.y + bounds.y * 600).toBe(end ? 120 : 0);
      expect(end ? anchor.x + 600 > 800 : anchor.x < 0).toBe(true);
    }
    drag.stop();
  });

  it.each(['blur', 'hide', 'closed', 'render-process-gone', 'did-start-loading'])(
    'stops capture and polling on %s',
    (event) => {
      const { drag, position, capture, window } = fixture();
      drag.start({ grab: { x: 0.5, y: 0.5 }, bounds: fullModelBounds });
      const owner =
        event === 'render-process-gone' || event === 'did-start-loading'
          ? window.webContents
          : window;
      owner.emit(event);
      expect(capture.mock.lastCall).toEqual([false]);
      expect(position.mock.lastCall).toEqual([null]);
      const count = position.mock.calls.length;
      vi.advanceTimersByTime(5000);
      expect(position).toHaveBeenCalledTimes(count);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
