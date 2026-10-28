import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function usePointerRegions() {
  const anchor = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => window.embodied.onHover(setHovered), []);
  useLayoutEffect(() => {
    const root = anchor.current;
    if (!root) return;
    const elements = [root, ...root.querySelectorAll('.pet-bubble, .pet-tools')];
    let frame = 0;
    const measure = () => {
      window.embodied.hitRegions(
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    elements.forEach((element) => observer.observe(element));
    frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
  return { anchor, hovered };
}
