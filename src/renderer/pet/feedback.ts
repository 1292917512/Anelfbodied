import type { BehaviorPreset } from '../../behavior/registry';

/** Blends DOM feedback from the current pose and owns all animation callbacks. */
export class BehaviorFeedback {
  private animation?: Animation;
  constructor(private readonly element: HTMLElement) {}

  play(feedback?: BehaviorPreset['feedback'], reducedMotion = false): void {
    const pose = getComputedStyle(this.element).transform;
    this.dispose();
    if (reducedMotion) return;
    this.element.style.transform = pose;
    const easing =
      feedback?.easing === 'linear'
        ? 'linear'
        : feedback?.easing === 'out'
          ? 'ease-out'
          : 'ease-in-out';
    const frames: Keyframe[] = feedback?.frames.map((frame) => ({
      offset: frame.offset,
      transform: `translate(${(frame.x ?? 0) * 100}%, ${(frame.y ?? 0) * 100}%) rotate(${frame.rotation ?? 0}deg) scale(${frame.scaleX ?? 1}, ${frame.scaleY ?? 1})`,
    })) ?? [{ transform: 'none' }];
    if (feedback && !feedback.loop) {
      this.animation = this.element.animate(
        frames.length === 1
          ? [{ transform: pose }, { ...frames[0], offset: 1 }]
          : [{ ...frames[0], transform: pose }, ...frames.slice(1)],
        { duration: feedback.durationMs, easing, fill: 'forwards' },
      );
      return;
    }
    const transition = this.element.animate(
      [{ transform: pose }, { transform: frames[0]!.transform }],
      {
        duration: 140,
        easing: 'ease-out',
        fill: 'forwards',
      },
    );
    this.animation = transition;
    transition.onfinish = () => {
      if (this.animation !== transition) return;
      transition.cancel();
      this.element.style.transform = '';
      this.animation = feedback
        ? this.element.animate(frames, {
            duration: feedback.durationMs,
            iterations: Infinity,
            easing,
          })
        : undefined;
    };
  }

  dispose(): void {
    if (this.animation) this.animation.onfinish = null;
    this.animation?.cancel();
    this.animation = undefined;
    this.element.style.transform = '';
  }
}
