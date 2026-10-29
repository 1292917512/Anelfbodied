import type { BehaviorPreset } from '../../behavior/registry';
export const drag: BehaviorPreset = {
  id: 'drag',
  name: '拎起',
  description: '按住并拖动时持续播放',
  priority: 100,
  matches: ({ signals }) => signals.has('drag'),
  feedback: {
    frames: [
      { rotation: -3, scaleX: 0.97, scaleY: 1.03 },
      { rotation: 3, scaleX: 0.97, scaleY: 1.03 },
      { rotation: -3, scaleX: 0.97, scaleY: 1.03 },
    ],
    durationMs: 900,
    loop: true,
    easing: 'smooth',
  },
};
