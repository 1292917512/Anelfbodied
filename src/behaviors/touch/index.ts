import type { BehaviorPreset } from '../../behavior/registry';
export const touch: BehaviorPreset = {
  id: 'touch',
  name: '触摸',
  description: '轻触或在头部来回抚摸',
  priority: 80,
  matches: ({ signals }) => signals.has('touch'),
  feedback: {
    frames: [{}, { y: -0.04, scaleX: 1.03, scaleY: 0.97, offset: 0.35 }, {}],
    durationMs: 600,
    easing: 'out',
    mark: '♡',
  },
};
