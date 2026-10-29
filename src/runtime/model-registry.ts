import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ControlError, type Action } from '../protocol/schema';
import { modelStatusSchema, type ModelCapabilities } from '../protocol/model';

/** Fences model actions to one activation and exposes renderer-confirmed readiness. */
export class ModelRegistry extends EventEmitter {
  private state?: ModelCapabilities;
  activate(
    model: Pick<
      ModelCapabilities,
      'skinId' | 'name' | 'type' | 'actions' | 'bindings' | 'behaviors'
    >,
  ): void {
    this.state = { ...structuredClone(model), revision: randomUUID(), status: 'loading' };
    this.emit('change');
  }
  snapshot(): ModelCapabilities | undefined {
    return this.state && structuredClone(this.state);
  }
  bindings(bindings: Record<string, string>): void {
    if (!this.state) return;
    this.state = { ...this.state, bindings: { ...bindings } };
    this.emit('change');
  }
  status(input: unknown): void {
    const update = modelStatusSchema.parse(input);
    if (!this.state || update.revision !== this.state.revision) return;
    if (this.state.status === update.status && this.state.detail === update.detail) return;
    this.state = { ...this.state, ...update };
    this.emit('change');
  }
  unavailable(detail: string): void {
    if (this.state) this.status({ revision: this.state.revision, status: 'error', detail });
  }
  validate(action: Action): void {
    if (action.action !== 'perform') return;
    if (!this.state || action.revision !== this.state.revision)
      throw new ControlError(
        'model_changed',
        'Model changed; discover pet_capabilities again',
        409,
      );
    if (this.state.status !== 'ready')
      throw new ControlError('model_unavailable', this.state.detail || 'Model is loading', 503);
    if (!this.state.actions.some((entry) => entry.name === action.name))
      throw new ControlError('unsupported_action', `Model has no action: ${action.name}`, 422);
  }
}
