import type { Action, ActionResult } from '../../protocol/schema';
import type { PresentationOrder } from '../../protocol/presentation';

export interface PetState {
  x: number;
  y: number;
  face: Extract<Action, { action: 'emote' }>['name'];
  text: string;
  question: string;
  options: string[];
  moving: boolean;
  performing: boolean;
}
const initial = (): PetState => ({
  x: 0.78,
  y: 0.75,
  face: 'neutral',
  text: '',
  question: '',
  options: [],
  moving: false,
  performing: false,
});

/** A single renderer task owns its timers, animation and answer callback. */
export class PetEngine {
  state = initial();
  private current?: { id: string; finish: (result: ActionResult) => void };
  constructor(
    private readonly changed: (state: PetState) => void,
    private readonly reply: (id: string, result: ActionResult) => void,
    private readonly model?: (
      action: Extract<Action, { action: 'perform' }>,
      signal: AbortSignal,
    ) => Promise<ActionResult>,
  ) {}
  dispatch(order: PresentationOrder): void {
    if (order.type === 'cancel') {
      if (this.current?.id === order.id) this.current.finish({ outcome: 'cancelled' });
      return;
    }
    this.current?.finish({ outcome: 'unknown', detail: 'Replaced by another renderer command' });
    this.run(order.id, order.action);
  }
  answer(text: string): void {
    if (this.state.question && text.trim())
      this.current?.finish({ outcome: 'completed', answer: text.slice(0, 4000) });
  }
  move(x: number, y: number): void {
    this.current?.finish({ outcome: 'cancelled', detail: 'User moved the pet' });
    this.state.x = Math.max(0, Math.min(1, x));
    this.state.y = Math.max(0, Math.min(1, y));
    this.emit();
  }
  dispose(): void {
    this.current?.finish({ outcome: 'unknown', detail: 'Renderer unloaded' });
  }
  private emit(): void {
    this.changed({ ...this.state, options: [...this.state.options] });
  }
  private run(id: string, action: Action): void {
    this.state.performing = action.action === 'perform';
    if (action.action === 'perform') {
      this.emit();
      const abort = new AbortController();
      let requested: ActionResult | undefined;
      this.current = {
        id,
        finish: (result) => {
          requested = result;
          abort.abort();
        },
      };
      void (
        this.model?.(action, abort.signal) ??
        Promise.resolve<ActionResult>({ outcome: 'failed', detail: 'No model renderer attached' })
      )
        .catch((error: unknown): ActionResult => ({
          outcome: 'failed',
          detail: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        }))
        .then((result) => {
          if (this.current?.id === id) {
            this.current = undefined;
            this.state.performing = false;
            this.emit();
          }
          this.reply(id, requested ?? result);
        });
      return;
    }
    let frame = 0;
    const finish = (result: ActionResult) => {
      if (this.current?.id !== id) return;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      this.current = undefined;
      if (action.action === 'move' && result.outcome === 'completed') {
        this.state.x = action.x;
        this.state.y = action.y;
      }
      this.state = {
        ...this.state,
        face: 'neutral',
        text: '',
        question: '',
        options: [],
        moving: false,
      };
      this.emit();
      this.reply(id, result);
    };
    const timer = setTimeout(
      () =>
        finish(
          action.action === 'ask'
            ? { outcome: 'failed', detail: 'Question timed out without an answer' }
            : { outcome: 'completed' },
        ),
      action.durationMs,
    );
    this.current = { id, finish };
    switch (action.action) {
      case 'say':
        this.state.text = action.text;
        break;
      case 'emote':
        this.state.face = action.name;
        break;
      case 'ask':
        this.state.question = action.question;
        this.state.options = action.options;
        break;
      case 'move': {
        this.state.moving = true;
        const start = performance.now(),
          x = this.state.x,
          y = this.state.y;
        const tick = () => {
          const progress = Math.min(1, (performance.now() - start) / action.durationMs);
          const eased = progress * progress * (3 - 2 * progress);
          this.state.x = x + (action.x - x) * eased;
          this.state.y = y + (action.y - y) * eased;
          this.emit();
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        break;
      }
      default: {
        const unsupported: never = action;
        throw new Error(`Unsupported action: ${JSON.stringify(unsupported)}`);
      }
    }
    this.emit();
  }
}
