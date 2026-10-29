import { useLayoutEffect, useRef } from 'react';
import type { HitMask } from '../../model/hit-mask';
import {
  regionContains,
  regionBounds,
  sameHitRegions,
  type HitRegion,
} from '../../shared/hit-region';
import { fullModelBounds, type Bounds } from '../../shared/geometry';

function rectangles(root: HTMLElement, selector: string): HitRegion[] {
  return [...root.querySelectorAll(selector)].map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { kind: 'rect', x, y, width, height };
  });
}

function modelRegions(root: HTMLElement, mask?: HitMask): HitRegion[] {
  const model = root.querySelector('.model-view');
  if (!model || model.getAttribute('data-model-status') !== 'ready')
    return rectangles(root, '.model-placeholder-symbol, .model-placeholder small');
  if (!mask) return [];
  const points = ['origin', 'horizontal', 'vertical'].map((name) =>
    model.querySelector(`.model-hit-${name}`)!.getBoundingClientRect(),
  );
  const [o, h, v] = points as [DOMRect, DOMRect, DOMRect];
  return [
    {
      kind: 'model',
      mask,
      origin: { x: o.x, y: o.y },
      horizontal: { x: h.x - o.x, y: h.y - o.y },
      vertical: { x: v.x - o.x, y: v.y - o.y },
    },
  ];
}

export function usePointerRegions(hitMask: () => HitMask | undefined) {
  const anchor = useRef<HTMLDivElement>(null);
  const current = useRef(hitMask);
  current.current = hitMask;
  useLayoutEffect(() => {
    const root = anchor.current;
    if (!root) return;
    let frame = 0,
      measuredAt = -Infinity;
    let previous: HitRegion[] | undefined;
    const measure = (now: number) => {
      if (now - measuredAt >= 40) {
        const regions = [
          ...modelRegions(root, current.current()),
          ...rectangles(root, '.pet-bubble, .pet-wheel'),
        ];
        if (!previous || !sameHitRegions(previous, regions)) {
          window.embodied.hitRegions(regions);
          previous = regions;
        }
        measuredAt = now;
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      window.embodied.hitRegions([]);
    };
  }, []);
  return {
    anchor,
    bounds: (): Bounds => {
      const root = anchor.current;
      const body = root?.querySelector('.pet-anchor')?.getBoundingClientRect();
      const region =
        root && modelRegions(root, current.current()).find((item) => item.kind === 'model');
      const bounds = region && regionBounds(region);
      if (!body?.width || !body.height || !bounds) return fullModelBounds;
      return {
        x: (bounds.x - body.x) / body.width,
        y: (bounds.y - body.y) / body.height,
        width: bounds.width / body.width,
        height: bounds.height / body.height,
      };
    },
    hitTest: (x: number, y: number) =>
      !!anchor.current &&
      modelRegions(anchor.current, current.current()).some((region) =>
        regionContains(region, x, y),
      ),
  };
}
