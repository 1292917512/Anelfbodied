import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelRegistry } from '../src/runtime/model-registry';
import { Controller } from '../src/runtime/controller';
import { Journal } from '../src/runtime/journal';
import type { ModelInstance } from '../src/model/renderer';
import { ModelSession } from '../src/model/session';
import { RendererRegistry } from '../src/model/registry';
import { skinSchema, type Skin } from '../src/model/schema';
import { registerActions } from '../src/model/loader';
import type { ActionResult } from '../src/protocol/schema';

const skin: Skin = {
  id: 'custom',
  name: 'Custom',
  type: 'test',
  author: '',
  license: '',
  builtin: false,
  model: {},
  bindings: { idle: 'rest' },
  actions: [
    { name: 'rest', description: 'Rest', durationMs: 100, kind: 'pose' },
    { name: 'arbitrary/动作', description: 'Custom', durationMs: 500, kind: 'motion' },
  ],
};
function activate(registry: ModelRegistry) {
  registry.activate({ ...skin, skinId: skin.id });
  const revision = registry.snapshot()!.revision;
  registry.status({ revision, status: 'ready' });
  return { action: 'perform' as const, name: 'arbitrary/动作', revision, durationMs: 500 };
}
afterEach(() => vi.useRealTimers());
describe('model boundaries', () => {
  it('requires matching activation, readiness and discovered actions', () => {
    const registry = new ModelRegistry(),
      action = activate(registry);
    expect(() => registry.validate(action)).not.toThrow();
    expect(() => registry.validate({ ...action, name: 'missing' })).toThrow('no action');
    registry.unavailable('Loading failed');
    expect(() => registry.validate(action)).toThrow('Loading failed');
    activate(registry);
    registry.status({ revision: action.revision, status: 'error', detail: 'Old renderer' });
    expect(registry.snapshot()!.status).toBe('ready');
    expect(() => registry.validate(action)).toThrow('Model changed');
  });
  it('preserves duplicate receipts and rejects queued model actions after switching', async () => {
    let finish!: (result: ActionResult) => void;
    const execute = vi.fn(
      () =>
        new Promise<ActionResult>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new Controller({ execute }, new Journal());
    const action = activate(controller.models);
    const batch = {
      protocol: 'desktop-pet/1',
      id: 'batch',
      session: 'session',
      expiresAt: Date.now() + 10000,
      commands: [{ action: 'say', text: 'First', durationMs: 300 }, action],
    };
    controller.submit('test', batch);
    activate(controller.models);
    finish({ outcome: 'completed' });
    const receipt = await controller.wait('test', batch.id);
    expect(receipt).toMatchObject({
      status: 'failed',
      completed: 1,
      results: [{ outcome: 'completed' }, { outcome: 'failed' }],
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(controller.submit('test', batch)).toEqual(receipt);
    await controller.close();
  });
  it('registers independent implementations without changing common code', () => {
    const registry = new RendererRegistry();
    const custom = { type: 'other', mount: vi.fn() };
    registry.register(custom);
    expect(registry.get('other')).toBe(custom);
    expect(() => registry.register(custom)).toThrow('Duplicate');
    expect(() => registry.get('unknown')).toThrow('未注册');
  });
  it('resolves arbitrary aliases and rejects broken behavior bindings', () => {
    const manifest = skinSchema.parse({
      version: 2,
      id: 'custom',
      name: 'Custom',
      type: 'other',
      model: {},
      actions: { idle: { source: 'rest' }, move: { source: 'arbitrary/动作' } },
      bindings: { idle: 'idle', move: 'move' },
    });
    expect(registerActions(manifest, skin.actions, {}).actions.map(({ name }) => name)).toEqual([
      'idle',
      'move',
    ]);
    manifest.bindings.touch = 'missing';
    expect(() => registerActions(manifest, skin.actions, {})).toThrow('不存在');
  });
  it('awaits cleanup before cancellation and restores the latest ambient behavior', async () => {
    vi.useFakeTimers();
    const instance = {
      hitMask: () => undefined,
      play: vi.fn<ModelInstance['play']>(async () => {}),
      stop: vi.fn(),
      dispose: vi.fn(),
    };
    const session = new ModelSession(skin, 'revision', vi.fn());
    await session.attach(instance);
    const signal = new AbortController();
    const result = session.execute(
      { action: 'perform', name: 'arbitrary/动作', revision: 'revision', durationMs: 500 },
      signal.signal,
    );
    await vi.advanceTimersByTimeAsync(10);
    signal.abort();
    expect(await result).toMatchObject({ outcome: 'cancelled' });
    expect(instance.stop).toHaveBeenCalled();
    expect(instance.play.mock.calls.at(-1)?.[0]).toBe('rest');
    session.dispose();
    expect(instance.dispose).toHaveBeenCalledOnce();
  });
  it('cancels on unmount, rejects stale work and reports component failure', async () => {
    vi.useFakeTimers();
    const failed = vi.fn();
    const session = new ModelSession(skin, 'revision', failed);
    const instance = {
      hitMask: () => undefined,
      play: vi.fn<ModelInstance['play']>(async () => {}),
      stop: vi.fn(),
      dispose: vi.fn(),
    };
    await session.attach(instance);
    const action = {
      action: 'perform' as const,
      name: 'arbitrary/动作',
      revision: 'revision',
      durationMs: 500,
    };
    expect(
      await session.execute({ ...action, revision: 'old' }, new AbortController().signal),
    ).toMatchObject({ outcome: 'failed' });
    const result = session.execute(action, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10);
    session.dispose();
    expect(await result).toMatchObject({ outcome: 'cancelled' });
    const broken = new ModelSession(skin, 'next', failed);
    const error = new Error('Cannot decode model');
    const bad = {
      ...instance,
      play: vi.fn(async () => {
        throw error;
      }),
    };
    await expect(broken.attach(bad)).rejects.toThrow('Cannot decode');
    expect(failed).toHaveBeenCalledWith(error);
    expect(
      await broken.execute({ ...action, revision: 'next' }, new AbortController().signal),
    ).toMatchObject({ outcome: 'failed' });
  });
});
