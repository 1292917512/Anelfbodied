import { useEffect, useRef, useState } from 'react';
import { behaviors } from '../../composition/behaviors';
import type { Skin } from '../../model/schema';

/** Adapts behavior signals to model bindings and optional DOM feedback. */
export function useBehavior(skin: Skin | undefined, signals: string[], performing: boolean) {
  const [pulse, setPulse] = useState({ id: '', sequence: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<HTMLSpanElement>(null);
  const behavior = behaviors.resolve({ signals: new Set([...signals, pulse.id]) });
  const bound = skin?.bindings[behavior?.id ?? 'idle'];
  const action = skin?.actions.find((action) => action.name === bound);
  const feedback = behavior?.feedback;
  const suppressed = performing || bound === '' || (action && action.kind !== 'pose');
  useEffect(() => {
    if (
      !frame.current ||
      !feedback ||
      suppressed ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const animation = frame.current.animate(
      feedback.frames.map((pose) => ({
        offset: pose.offset,
        transform: `translate(${(pose.x ?? 0) * 100}%, ${(pose.y ?? 0) * 100}%) rotate(${pose.rotation ?? 0}deg) scale(${pose.scaleX ?? 1}, ${pose.scaleY ?? 1})`,
      })),
      {
        duration: feedback.durationMs,
        iterations: feedback.loop ? Infinity : 1,
        easing:
          feedback.easing === 'linear'
            ? 'linear'
            : feedback.easing === 'out'
              ? 'ease-out'
              : 'ease-in-out',
      },
    );
    return () => animation.cancel();
  }, [feedback, suppressed, pulse.sequence]);
  useEffect(() => {
    setPulse({ id: '', sequence: 0 });
    return () => clearTimeout(timer.current);
  }, [skin?.id]);
  return {
    frame,
    id: behavior?.id ?? 'idle',
    mark: !performing && bound !== '' ? feedback?.mark : undefined,
    sequence: behavior?.id === pulse.id ? pulse.sequence : 0,
    trigger(id: string) {
      const preset = behaviors.get(id);
      if (!preset) return;
      clearTimeout(timer.current);
      const action = skin?.actions.find((entry) => entry.name === skin.bindings[id]);
      setPulse((previous) => ({ id, sequence: previous.sequence + 1 }));
      timer.current = setTimeout(
        () => setPulse((previous) => ({ ...previous, id: '' })),
        Math.min(12000, Math.max(600, action?.durationMs ?? preset.feedback?.durationMs ?? 1000)),
      );
    },
  };
}
