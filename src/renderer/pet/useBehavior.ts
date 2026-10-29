import { useEffect, useRef, useState } from 'react';
import { behaviors } from '../../composition/behaviors';
import type { Skin } from '../../model/schema';
import { BehaviorFeedback } from './feedback';

/** Adapts behavior signals to model bindings and optional DOM feedback. */
export function useBehavior(skin: Skin | undefined, signals: string[], performing: boolean) {
  const [pulse, setPulse] = useState({ id: '', sequence: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<HTMLSpanElement>(null);
  const player = useRef<BehaviorFeedback | undefined>(undefined);
  const behavior = behaviors.resolve({ signals: new Set([...signals, pulse.id]) });
  const bound = skin?.bindings[behavior?.id ?? 'idle'];
  const action = skin?.actions.find((action) => action.name === bound);
  const feedback = behavior?.feedback;
  const suppressed = performing || bound === '' || (action && action.kind !== 'pose');
  useEffect(() => {
    if (!frame.current) return;
    player.current ??= new BehaviorFeedback(frame.current);
    player.current.play(
      suppressed ? undefined : feedback,
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, [feedback, suppressed, pulse.sequence]);
  useEffect(() => () => player.current?.dispose(), []);
  useEffect(() => {
    setPulse({ id: '', sequence: 0 });
    return () => clearTimeout(timer.current);
  }, [skin?.id]);
  return {
    frame,
    id: behavior?.id ?? 'idle',
    mark: !performing && bound !== '' ? feedback?.mark : undefined,
    sequence: behavior?.id === pulse.id ? pulse.sequence : 0,
    clear() {
      clearTimeout(timer.current);
      setPulse((previous) => ({ ...previous, id: '' }));
    },
    trigger(id: string) {
      const preset = behaviors.get(id);
      if (!preset) return;
      clearTimeout(timer.current);
      const action = skin?.actions.find((entry) => entry.name === skin.bindings[id]);
      setPulse((previous) => ({ id, sequence: previous.sequence + 1 }));
      const duration =
        action && action.kind !== 'pose'
          ? (action.durationMs ?? 1000)
          : (preset.feedback?.durationMs ?? 1000);
      timer.current = setTimeout(
        () => setPulse((previous) => ({ ...previous, id: '' })),
        Math.min(120000, Math.max(100, duration)),
      );
    },
  };
}
