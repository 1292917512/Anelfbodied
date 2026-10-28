import { describe, expect, it } from 'vitest';
import { panelAnchor, petAnchor } from '../src/shared/geometry';

describe('floating panel placement', () => {
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
