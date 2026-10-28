import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, MouseEvent } from 'react';
import { normalizePet } from '../../shared/geometry';

interface Callbacks {
  pat(): void;
  talk(): void;
  move(x: number, y: number): void;
}
export function usePetGestures(callbacks: Callbacks, scale = 1) {
  const [pressed, setPressed] = useState(false);
  const [look, setLook] = useState(0);
  const drag = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);
  const click = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef(callbacks);
  current.current = callbacks;
  useEffect(() => () => clearTimeout(click.current), []);
  return {
    pressed,
    look,
    drag,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0) return;
        clearTimeout(click.current);
        window.embodied.capturePet(true);
        setPressed(true);
        moved.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.parentElement!.getBoundingClientRect();
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          moved: false,
        };
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        setLook(
          Math.max(
            -1,
            Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)),
          ),
        );
        if (!drag.current) return;
        window.embodied.capturePet(true);
        if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 5) {
          drag.current.moved = true;
          moved.current = true;
          clearTimeout(click.current);
        }
        if (drag.current.moved) {
          const point = normalizePet(
            { width: innerWidth, height: innerHeight },
            { x: event.clientX - drag.current.offsetX, y: event.clientY - drag.current.offsetY },
            scale,
          );
          current.current.move(point.x, point.y);
        }
      },
      onPointerUp() {
        drag.current = null;
        setPressed(false);
        window.embodied.capturePet(false);
      },
      onLostPointerCapture() {
        if (drag.current) {
          drag.current = null;
          setPressed(false);
          window.embodied.capturePet(false);
        }
      },
      onPointerLeave() {
        setLook(0);
      },
      onClick(event: MouseEvent<HTMLButtonElement>) {
        if (moved.current) return;
        clearTimeout(click.current);
        if (event.detail === 0) current.current.pat();
        else if (event.detail === 1) click.current = setTimeout(() => current.current.pat(), 280);
      },
      onDoubleClick() {
        clearTimeout(click.current);
        if (!moved.current) current.current.talk();
      },
    },
  };
}
