import type { BehaviorPreset } from '../../behavior/registry';
export const drop: BehaviorPreset = {
  id: 'drop',
  name: '放下',
  description: '拖动结束后轻轻落定',
  priority: 90,
  matches: ({ signals }) => signals.has('drop'),
  feedback: {
    frames: [{ scaleX: 0.98, scaleY: 1.02 }, { scaleX: 1.04, scaleY: 0.96, offset: 0.3 }, {}],
    durationMs: 450,
    easing: 'out',
  },
};
