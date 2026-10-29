import type { BehaviorPreset } from '../../behavior/registry';
export const idle: BehaviorPreset = {
  id: 'idle',
  name: '待机',
  description: '没有其他行为时轻轻呼吸',
  priority: 0,
  matches: () => true,
  feedback: {
    frames: [{}, { y: -0.02 }, {}],
    durationMs: 3800,
    loop: true,
    easing: 'smooth',
  },
};
