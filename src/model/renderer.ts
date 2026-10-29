import type { Skin } from './schema';
import type { HitMask } from './hit-mask';

export interface ModelInstance {
  hitMask(): HitMask | undefined;
  /** Resolves when replacement playback starts; components may blend from the current pose. */
  play(name: string, signal: AbortSignal): Promise<void>;
  stop(): void;
  dispose(): void;
}
export interface ModelRenderer {
  type: string;
  mount(
    host: HTMLElement,
    skin: Skin,
    signal: AbortSignal,
    failed: (error: Error) => void,
    options?: { muted?: boolean },
  ): Promise<ModelInstance>;
}
export const aborted = () => new DOMException('Model operation cancelled', 'AbortError');
export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(aborted());
      return;
    }
    const done = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}
