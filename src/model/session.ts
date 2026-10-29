import type { Action, ActionResult } from '../protocol/schema';
import type { Skin } from './schema';
import type { ModelInstance } from './renderer';
import { waitFor } from './renderer';

/** Owns one model activation and restores ambient behavior after each command. */
export class ModelSession {
  private instance?: ModelInstance;
  private lifetime = new AbortController();
  private ambientAbort?: AbortController;
  private command?: AbortController;
  private behavior = 'idle';
  private bindings: Record<string, string>;
  private ambientName?: string;
  private error?: Error;
  constructor(
    readonly skin: Skin,
    readonly revision: string,
    private readonly failed: (error: Error) => void,
  ) {
    this.bindings = { ...skin.bindings };
  }
  updateBindings(bindings: Record<string, string>): void {
    this.bindings = { ...bindings };
    void this.ambient(this.behavior).catch(() => {});
  }
  hitMask() {
    return this.lifetime.signal.aborted || this.error ? undefined : this.instance?.hitMask();
  }
  async attach(instance: ModelInstance): Promise<void> {
    if (this.lifetime.signal.aborted) {
      instance.dispose();
      return;
    }
    if (this.error) {
      instance.dispose();
      throw this.error;
    }
    this.instance = instance;
    await this.ambient(this.behavior);
  }
  async ambient(behavior: string, restart = false): Promise<void> {
    this.behavior = behavior;
    if (this.command || !this.instance || this.lifetime.signal.aborted || this.error) return;
    const bound = this.bindings[behavior];
    const name =
      bound === '' && behavior !== 'idle' ? this.bindings.idle : (bound ?? this.bindings.idle);
    if (
      !(restart && bound) &&
      this.ambientName === name &&
      this.ambientAbort &&
      !this.ambientAbort.signal.aborted
    )
      return;
    this.ambientAbort?.abort();
    this.ambientName = name;
    if (!name) {
      this.instance.stop();
      return;
    }
    const abort = (this.ambientAbort = new AbortController());
    try {
      await this.instance.play(name, abort.signal);
    } catch (error) {
      if (!abort.signal.aborted)
        this.fail(error instanceof Error ? error : new Error(String(error)));
    }
    if (this.error) throw this.error;
  }
  fail(error: Error): void {
    if (this.error || this.lifetime.signal.aborted) return;
    this.error = error;
    this.command?.abort();
    this.ambientAbort?.abort();
    this.instance?.dispose();
    this.instance = undefined;
    this.failed(error);
  }
  private failure(): Error | undefined {
    return this.error;
  }
  async execute(
    action: Extract<Action, { action: 'perform' }>,
    signal: AbortSignal,
  ): Promise<ActionResult> {
    if (action.revision !== this.revision)
      return { outcome: 'failed', detail: 'Model changed; discover capabilities again' };
    if (!this.instance || this.error || this.lifetime.signal.aborted)
      return { outcome: 'failed', detail: this.error?.message ?? 'Model is not ready' };
    if (!this.skin.actions.some(({ name }) => name === action.name))
      return { outcome: 'failed', detail: 'Unsupported model action' };
    if (this.command) return { outcome: 'failed', detail: 'Model is busy' };
    const abort = new AbortController();
    const combined = AbortSignal.any([signal, abort.signal, this.lifetime.signal]);
    this.command = abort;
    this.ambientAbort?.abort();
    try {
      combined.throwIfAborted();
      await this.instance.play(action.name, combined);
      await waitFor(action.durationMs, combined);
      return { outcome: 'completed' };
    } catch (error) {
      return this.failure()
        ? { outcome: 'failed', detail: this.failure()!.message.slice(0, 500) }
        : combined.aborted
          ? { outcome: 'cancelled', detail: 'Model action cancelled or skin changed' }
          : {
              outcome: 'failed',
              detail: (error instanceof Error ? error.message : String(error)).slice(0, 500),
            };
    } finally {
      if (combined.aborted || this.error) this.instance?.stop();
      this.command = undefined;
      void this.ambient(this.behavior).catch(() => {});
    }
  }
  dispose(): void {
    this.lifetime.abort();
    this.ambientAbort?.abort();
    this.command?.abort();
    this.instance?.dispose();
    this.instance = undefined;
  }
}
