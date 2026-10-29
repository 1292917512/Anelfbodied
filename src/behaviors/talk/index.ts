import type { BehaviorPreset } from '../../behavior/registry';
export const talk: BehaviorPreset = {
  id: 'talk',
  name: '说话',
  description: '展示话语或问题时播放',
  priority: 40,
  matches: ({ signals }) => signals.has('talk'),
  feedback: {
    frames: [{}, { rotation: 2 }, {}],
    durationMs: 1800,
    loop: true,
    easing: 'smooth',
  },
};
