import { existsSync, readFileSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { Skin } from '../model/schema';
import type { BehaviorRegistry } from '../behavior/registry';
import { bindingPatchSchema, type BehaviorSettings } from '../behavior/settings';

const savedSchema = z
  .object({
    version: z.literal(1),
    skins: z.record(z.string().max(40), z.record(z.string().max(40), z.string().max(120))),
  })
  .strict();

/** Persists per-skin overrides without modifying imported or referenced model resources. */
export class BehaviorPreferences {
  private skins: Record<string, Record<string, string>> = {};
  constructor(
    private readonly file: string,
    private readonly registry: BehaviorRegistry,
    report: (message: string) => void = () => {},
  ) {
    if (!existsSync(file)) return;
    try {
      if (statSync(file).size > 256_000) throw new Error('Behavior preferences are too large');
      this.skins = savedSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).skins;
    } catch {
      report('Invalid behavior preferences; using skin defaults');
    }
  }
  snapshot(skin: Skin): BehaviorSettings {
    return {
      presets: this.registry.list(),
      defaults: { ...skin.bindings },
      overrides: { ...this.skins[skin.id] },
    };
  }
  resolve(skin: Skin): Skin {
    const bindings = { ...skin.bindings };
    for (const [behavior, action] of Object.entries(this.skins[skin.id] ?? {})) {
      if (action === '' || skin.actions.some((item) => item.name === action))
        bindings[behavior] = action;
    }
    return { ...skin, bindings };
  }
  update(skin: Skin, input: unknown): void {
    const { skinId, patch } = bindingPatchSchema.parse(input);
    if (skinId !== skin.id) throw new Error('形象已切换，请重新选择行为');
    const overrides = { ...this.skins[skinId] };
    const registered = new Set(this.registry.list().map((item) => item.id));
    for (const [behavior, action] of Object.entries(patch)) {
      if (!registered.has(behavior)) throw new Error(`未注册的行为：${behavior}`);
      if (action && !skin.actions.some((item) => item.name === action))
        throw new Error('动作已不可用');
      if (action === null) delete overrides[behavior];
      else overrides[behavior] = action;
    }
    const next = { ...this.skins, [skinId]: overrides };
    if (!Object.keys(overrides).length) delete next[skinId];
    this.save(next);
  }
  remove(skinId: string): void {
    if (!this.skins[skinId]) return;
    const next = { ...this.skins };
    delete next[skinId];
    this.save(next);
  }
  private save(skins: typeof this.skins): void {
    const serialized = JSON.stringify({ version: 1, skins });
    if (Buffer.byteLength(serialized) > 256_000) throw new Error('行为配置超出容量');
    writeFileSync(`${this.file}.tmp`, serialized, { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
    this.skins = skins;
  }
}
