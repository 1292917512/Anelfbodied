import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import { actionResultSchema, type Action, type ActionResult } from '../protocol/schema';
import type { ActionDriver } from '../runtime/controller';
import type { RendererOrder } from './contracts';

/** Renderer acknowledgement, bounded cancellation, and crash recovery live at the host boundary. */
export class RendererDriver implements ActionDriver {
  private pending?: { id: string; settle: (result: ActionResult) => void };
  private available = false;
  constructor(private readonly contents: WebContents) {
    contents.on('render-process-gone', () => this.lost('Renderer process exited'));
    contents.on('did-start-loading', () => this.lost('Renderer reloaded'));
    contents.on('destroyed', () => this.lost('Desktop window closed'));
  }
  ready(): void {
    this.available = true;
  }
  acknowledge(id: string, input: unknown): void {
    const result = actionResultSchema.safeParse(input);
    if (this.pending?.id === id && result.success) this.pending.settle(result.data);
  }
  private lost(detail: string): void {
    this.available = false;
    this.pending?.settle({ outcome: 'unknown', detail });
  }
  private send(order: RendererOrder): void {
    this.contents.send('pet:order', order);
  }
  execute(action: Action, signal: AbortSignal): Promise<ActionResult> {
    if (signal.aborted) return Promise.resolve({ outcome: 'cancelled' });
    if (!this.available || this.contents.isDestroyed())
      return Promise.resolve({ outcome: 'failed', detail: 'Desktop renderer is not ready' });
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
        if (!this.contents.isDestroyed()) this.send({ type: 'cancel', id });
        cancelTimer = setTimeout(() => {
          this.available = false;
          settle({
            outcome: 'unknown',
            detail: 'Renderer did not acknowledge cancellation; renderer was reset',
          });
          if (!this.contents.isDestroyed()) this.contents.forcefullyCrashRenderer();
        }, 1000);
      };
      this.pending = { id, settle };
      signal.addEventListener('abort', cancel, { once: true });
      this.send({ type: 'execute', id, action });
    });
  }
}
