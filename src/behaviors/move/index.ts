import type { BehaviorPreset } from '../../behavior/registry';
export const move: BehaviorPreset = {
  id: 'move',
  name: '移动',
  description: 'AI 指令移动期间播放',
  priority: 60,
  matches: ({ signals }) => signals.has('move'),
  feedback: {
    frames: [{ rotation: -2 }, { rotation: 2, y: -0.02 }, { rotation: -2 }],
    durationMs: 450,
    loop: true,
    easing: 'smooth',
  },
};
