import type { BehaviorPreset } from '../../behavior/registry';

export const emotions: BehaviorPreset[] = [
  {
    id: 'happy',
    name: '开心',
    description: 'AI 表达开心',
    mark: '✦',
    pose: { rotation: 4, y: -0.03 },
  },
  {
    id: 'thinking',
    name: '思考',
    description: 'AI 表达思考',
    mark: '···',
    pose: { rotation: -5 },
  },
  {
    id: 'sleepy',
    name: '困倦',
    description: 'AI 表达困倦',
    mark: 'Zz',
    pose: { rotation: -4, scaleX: 0.98, scaleY: 0.98 },
  },
  {
    id: 'surprised',
    name: '惊讶',
    description: 'AI 表达惊讶',
    mark: '!',
    pose: { y: -0.03, scaleX: 1.03, scaleY: 1.03 },
  },
].map(({ pose, mark, ...info }) => ({
  ...info,
  priority: 50,
  matches: ({ signals }) => signals.has(info.id),
  feedback: {
    frames: [{}, pose, {}],
    durationMs: 1800,
    loop: true,
    easing: 'smooth',
    mark,
  },
}));
