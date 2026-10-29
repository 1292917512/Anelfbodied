import type { Action, ActionResult, Cancel, Receipt, capabilities } from '../protocol/schema';
import type { ModelCapabilities } from '../protocol/model';
import type { PresentationOrder } from '../protocol/presentation';

/** Transport-independent command, discovery and receipt operations. */
export interface ControlService {
  capabilities(): ReturnType<typeof capabilities> & { model?: ModelCapabilities };
  submit(owner: string, input: unknown): Receipt;
  get(owner: string, id: string): Receipt | undefined;
  list(owner?: string): Receipt[];
  wait(owner: string, id: string): Promise<Receipt>;
  cancel(owner: string, target: Cancel): Promise<Receipt[]>;
}

/** Resolves only after presentation finishes or cancellation stops its effects. */
export interface ActionDriver {
  execute(action: Action, signal: AbortSignal): Promise<ActionResult>;
}

/** A platform adapter delivers orders and can reset an unresponsive frontend. */
export interface PresentationChannel {
  send(order: PresentationOrder): void;
  reset(): void;
}
