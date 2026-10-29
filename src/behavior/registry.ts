export interface BehaviorInfo {
  id: string;
  name: string;
  description: string;
}

export interface BehaviorContext {
  signals: ReadonlySet<string>;
}

export interface BehaviorPreset extends BehaviorInfo {
  priority: number;
  matches(context: BehaviorContext): boolean;
  feedback?: {
    frames: {
      x?: number;
      y?: number;
      rotation?: number;
      scaleX?: number;
      scaleY?: number;
      offset?: number;
    }[];
    durationMs: number;
    loop?: boolean;
    easing?: 'linear' | 'smooth' | 'out';
    mark?: string;
  };
}

/** Resolves concurrent behavior signals without depending on a renderer or channel. */
export class BehaviorRegistry {
  private readonly entries: readonly BehaviorPreset[];
  constructor(presets: readonly BehaviorPreset[]) {
    const ids = new Set<string>();
    for (const preset of presets) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(preset.id) || ids.has(preset.id))
        throw new Error(`Invalid or duplicate behavior: ${preset.id}`);
      ids.add(preset.id);
    }
    this.entries = [...presets].sort((a, b) => b.priority - a.priority);
  }
  list(): BehaviorInfo[] {
    return this.entries.map(({ id, name, description }) => ({ id, name, description }));
  }
  get(id: string): BehaviorPreset | undefined {
    return this.entries.find((entry) => entry.id === id);
  }
  resolve(context: BehaviorContext): BehaviorPreset | undefined {
    return this.entries.find((entry) => entry.matches(context));
  }
}
