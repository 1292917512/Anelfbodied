import type { Action, ActionResult } from '../protocol/schema';
import type { PresentationOrder } from '../protocol/presentation';

/** Resolves only after presentation finishes or cancellation stops its effects. */
export interface ActionDriver {
  execute(action: Action, signal: AbortSignal): Promise<ActionResult>;
}

/** A platform adapter delivers orders and can reset an unresponsive frontend. */
export interface PresentationChannel {
  send(order: PresentationOrder): void;
  reset(): void;
}
