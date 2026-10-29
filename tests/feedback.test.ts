import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorFeedback } from '../src/renderer/pet/feedback';
import { behaviors } from '../src/composition/behaviors';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  let pose = 'none';
  vi.stubGlobal('getComputedStyle', () => ({ transform: pose }));
  const animate = vi.fn<
    (
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      cancel(): void;
      onfinish: (() => void) | null;
    }
  >(() => ({
    cancel: vi.fn(),
    onfinish: null as (() => void) | null,
  }));
  const element = { style: { transform: '' }, animate };
  const player = new BehaviorFeedback(element as unknown as HTMLElement);
  return {
    player,
    element,
    animate,
    pose: (value: string) => {
      pose = value;
    },
  };
}

describe('behavior pose transitions', () => {
  it('connects drag, drop and idle without resetting the sampled pose', () => {
    const { player, animate, pose } = fixture();
    player.play(behaviors.get('drag')!.feedback);
    animate.mock.results.at(-1)!.value.onfinish!();
    const dragging = animate.mock.results.at(-1)!.value;
    expect(animate.mock.calls.at(-1)![1].iterations).toBe(Infinity);
    const released = 'matrix(0.99, 0.04, -0.04, 1.02, 0, 0)';
    pose(released);
    player.play(behaviors.get('drop')!.feedback);
    expect(dragging.cancel).toHaveBeenCalledOnce();
    expect(animate.mock.calls.at(-1)![0][0]!.transform).toBe(released);
    expect(animate.mock.calls.at(-1)![1].duration).toBe(450);
    pose('matrix(1, 0, 0, 1, 0, 0)');
    player.play(behaviors.get('idle')!.feedback);
    animate.mock.results.at(-1)!.value.onfinish!();
    expect(animate.mock.calls.at(-1)![1]).toMatchObject({ duration: 3800, iterations: Infinity });
    player.dispose();
    expect(animate.mock.results.at(-1)!.value.cancel).toHaveBeenCalledOnce();
  });

  it('prevents an interrupted transition from restarting its old loop', () => {
    const { player, animate, element } = fixture();
    player.play(behaviors.get('drag')!.feedback);
    const stale = animate.mock.results.at(-1)!.value.onfinish!;
    player.play(behaviors.get('touch')!.feedback);
    stale();
    expect(animate).toHaveBeenCalledTimes(2);
    player.play(undefined, true);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(element.style.transform).toBe('');
  });
});
