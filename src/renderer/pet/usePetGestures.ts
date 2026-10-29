import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, MouseEvent } from 'react';
import { normalizePet } from '../../shared/geometry';

interface Callbacks {
  hitTest(x: number, y: number): boolean;
  menu(): void;
  touch(): void;
  talk(): void;
  dragging(active: boolean, cancelled: boolean): void;
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
  const stroke = useRef({ x: 0, y: 0, time: 0, distance: 0, cooldown: 0 });
  const current = useRef(callbacks);
  current.current = callbacks;
  const release = (cancelled: boolean) => {
    const dragging = drag.current?.moved;
    drag.current = null;
    setPressed(false);
    if (cancelled) {
      moved.current = true;
      clearTimeout(click.current);
    }
    window.embodied.capturePet(false);
    if (dragging) current.current.dragging(false, cancelled);
  };
  useEffect(() => {
    const blur = () => release(true);
    window.addEventListener('blur', blur);
    return () => {
      clearTimeout(click.current);
      window.removeEventListener('blur', blur);
      window.embodied.capturePet(false);
    };
  }, []);
  return {
    pressed,
    look,
    drag,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || !event.isPrimary) return;
        if (!current.current.hitTest(event.clientX, event.clientY)) {
          event.preventDefault();
          return;
        }
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
        if (!event.isPrimary) return;
        if (!drag.current && !current.current.hitTest(event.clientX, event.clientY)) {
          setLook(0);
          stroke.current.distance = 0;
          stroke.current.time = 0;
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setLook(
          Math.max(
            -1,
            Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)),
          ),
        );
        if (!drag.current) {
          const now = performance.now(),
            previous = stroke.current;
          const distance = Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
          const nearHead = event.clientY < rect.top + rect.height * 0.6;
          previous.distance =
            nearHead && now - previous.time < 180
              ? previous.distance + Math.min(distance, rect.width * 0.15)
              : 0;
          Object.assign(previous, { x: event.clientX, y: event.clientY, time: now });
          if (previous.distance > Math.max(55, rect.width * 0.8) && now > previous.cooldown) {
            previous.distance = 0;
            previous.cooldown = now + 2200;
            current.current.touch();
          }
          return;
        }
        window.embodied.capturePet(true);
        if (
          !drag.current.moved &&
          Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 5
        ) {
          drag.current.moved = true;
          moved.current = true;
          clearTimeout(click.current);
          current.current.dragging(true, false);
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
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        if (event.button === 0) release(false);
      },
      onPointerCancel() {
        release(true);
      },
      onLostPointerCapture() {
        if (drag.current) release(true);
      },
      onPointerLeave() {
        setLook(0);
        stroke.current.distance = 0;
      },
      onClick(event: MouseEvent<HTMLButtonElement>) {
        if (event.detail !== 0 && !current.current.hitTest(event.clientX, event.clientY)) return;
        if (moved.current && event.detail !== 0) return;
        clearTimeout(click.current);
        if (event.detail === 0) current.current.menu();
        else if (event.detail === 1) click.current = setTimeout(() => current.current.menu(), 280);
      },
      onDoubleClick(event: MouseEvent<HTMLButtonElement>) {
        clearTimeout(click.current);
        if (!moved.current && current.current.hitTest(event.clientX, event.clientY))
          current.current.talk();
      },
    },
  };
}
