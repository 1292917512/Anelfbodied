import { randomUUID } from 'node:crypto';
import type { Action, ActionResult } from '../protocol/schema';
import { presentationReplySchema, type PresentationOrder } from '../protocol/presentation';
import type { ActionDriver, PresentationChannel } from './ports';

/** Awaits frontend receipts and resets an endpoint that cannot confirm cancellation. */
export class PresentationDriver implements ActionDriver {
  private pending?: { id: string; settle: (result: ActionResult) => void };
  private available = false;
  constructor(private readonly channel: PresentationChannel) {}
  ready(): void {
    this.available = true;
  }
  acknowledge(id: string, input: unknown): void {
    const reply = presentationReplySchema.safeParse({ id, result: input });
    if (this.pending?.id === id && reply.success) this.pending.settle(reply.data.result);
  }
  disconnected(detail: string): void {
    this.available = false;
    this.pending?.settle({ outcome: 'unknown', detail });
  }
  private send(order: PresentationOrder): boolean {
    try {
      this.channel.send(order);
      return true;
    } catch {
      this.disconnected('Presentation connection failed');
      return false;
    }
  }
  execute(action: Action, signal: AbortSignal): Promise<ActionResult> {
    if (signal.aborted) return Promise.resolve({ outcome: 'cancelled' });
    if (!this.available)
      return Promise.resolve({ outcome: 'failed', detail: 'Presentation frontend is not ready' });
    if (this.pending)
      return Promise.resolve({ outcome: 'failed', detail: 'Presentation frontend is busy' });
    return new Promise((resolve) => {
      const id = randomUUID();
      let cancelTimer: ReturnType<typeof setTimeout> | undefined;
      const deadline = setTimeout(() => cancel(), action.durationMs + 3000);
      const settle = (result: ActionResult) => {
        if (this.pending?.id !== id) return;
        this.pending = undefined;
        clearTimeout(deadline);
        clearTimeout(cancelTimer);
        signal.removeEventListener('abort', cancel);
        resolve(result);
      };
      const cancel = () => {
        if (this.pending?.id !== id || cancelTimer) return;
        if (!this.send({ type: 'cancel', id }) || this.pending?.id !== id) return;
        cancelTimer = setTimeout(() => {
          this.available = false;
          settle({
            outcome: 'unknown',
            detail: 'Frontend did not acknowledge cancellation; connection was reset',
          });
          try {
            this.channel.reset();
          } catch {
            /* The channel is already unavailable. */
          }
        }, 1000);
      };
      this.pending = { id, settle };
      signal.addEventListener('abort', cancel, { once: true });
      this.send({ type: 'execute', id, action });
    });
  }
}
