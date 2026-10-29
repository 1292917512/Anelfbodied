import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BehaviorRegistry } from '../src/behavior/registry';
import { behaviors } from '../src/composition/behaviors';
import { BehaviorPreferences } from '../src/skins/behavior-settings';
import { ModelSession } from '../src/model/session';
import type { ModelInstance } from '../src/model/renderer';
import type { Skin } from '../src/model/schema';
import { wheelPosition, wheelSize } from '../src/renderer/pet/wheel/layout';

const skin: Skin = {
  id: 'test',
  name: 'Test',
  type: 'other',
  author: '',
  license: '',
  builtin: false,
  model: {},
  actions: [
    { name: 'rest', description: '', kind: 'pose', durationMs: 100 },
    { name: 'wave', description: '', kind: 'motion', durationMs: 1000 },
  ],
  bindings: { idle: 'rest' },
};

describe('behavior extension and preferences', () => {
  it('resolves drag before touch and lets an injected preset join without core changes', () => {
    expect(behaviors.resolve({ signals: new Set(['drag', 'touch', 'talk']) })?.id).toBe('drag');
    const extension = new BehaviorRegistry([
      {
        id: 'listening',
        name: '倾听',
        description: '',
        priority: 10,
        matches: ({ signals }) => signals.has('listening'),
      },
      { id: 'idle', name: '待机', description: '', priority: 0, matches: () => true },
    ]);
    expect(extension.resolve({ signals: new Set(['listening']) })?.id).toBe('listening');
    expect(extension.resolve({ signals: new Set() })?.id).toBe('idle');
    expect(() => new BehaviorRegistry([behaviors.get('idle')!, behaviors.get('idle')!])).toThrow(
      'duplicate',
    );
  });
  it('persists independent overrides, disables and resets without modifying skin data', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'anelf-behaviors-')), 'behaviors.json');
    const settings = new BehaviorPreferences(file, behaviors);
    settings.update(skin, { skinId: skin.id, patch: { touch: 'wave', drag: '' } });
    const restored = new BehaviorPreferences(file, behaviors);
    expect(restored.resolve(skin).bindings).toEqual({ idle: 'rest', touch: 'wave', drag: '' });
    expect(restored.resolve({ ...skin, id: 'another' }).bindings).toEqual({ idle: 'rest' });
    expect(skin.bindings).toEqual({ idle: 'rest' });
    expect(() => restored.update(skin, { skinId: 'another', patch: { touch: 'wave' } })).toThrow(
      '已切换',
    );
    expect(() => restored.update(skin, { skinId: skin.id, patch: { unknown: 'wave' } })).toThrow(
      '未注册',
    );
    expect(() => restored.update(skin, { skinId: skin.id, patch: { touch: 'missing' } })).toThrow(
      '不可用',
    );
    expect(
      restored.resolve({ ...skin, actions: [skin.actions[0]!] }).bindings.touch,
    ).toBeUndefined();
    restored.update(skin, { skinId: skin.id, patch: { touch: null, drag: null } });
    expect(JSON.parse(readFileSync(file, 'utf8')).skins).toEqual({});
  });
  it('updates ambient mappings without interrupting a running model command', async () => {
    vi.useFakeTimers();
    const instance = {
      hitMask: () => undefined,
      play: vi.fn<ModelInstance['play']>(async () => {}),
      stop: vi.fn(),
      dispose: vi.fn(),
    };
    const session = new ModelSession(skin, 'stable', vi.fn());
    try {
      await session.attach(instance);
      await session.ambient('talk');
      expect(instance.play).toHaveBeenCalledTimes(1);
      const command = session.execute(
        { action: 'perform', name: 'wave', revision: 'stable', durationMs: 1000 },
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(10);
      session.updateBindings({ idle: 'wave', touch: '' });
      expect(instance.play).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await command).toEqual({ outcome: 'completed' });
      expect(instance.play.mock.calls.at(-1)?.[0]).toBe('wave');
      await session.ambient('touch');
      expect(instance.play).toHaveBeenCalledTimes(3);
      expect(instance.dispose).not.toHaveBeenCalled();
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });
  it('keeps a fixed-size wheel reachable at every edge and model size', () => {
    for (const viewport of [
      { width: 360, height: 460 },
      { width: 800, height: 600 },
      { width: 3840, height: 2160 },
    ])
      for (const size of [35, 140, 560, 1400])
        for (const x of [0, viewport.width - size])
          for (const y of [0, viewport.height - size]) {
            const position = wheelPosition(viewport, { x, y, width: size, height: size });
            expect(position.x).toBeGreaterThanOrEqual(0);
            expect(position.y).toBeGreaterThanOrEqual(0);
            expect(position.x + wheelSize).toBeLessThanOrEqual(viewport.width);
            expect(position.y + wheelSize).toBeLessThanOrEqual(viewport.height);
          }
  });
});
