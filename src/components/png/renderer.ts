import type { PngModel } from './schema';
import type { ModelRenderer } from '../../model/renderer';
import type { HitMask } from '../../model/hit-mask';
import { alphaSampler } from '../../model/alpha-sampler';

export const pngRenderer: ModelRenderer = {
  type: 'png',
  async mount(host, skin, signal) {
    const sample = alphaSampler();
    const model = skin.model as PngModel;
    const viewport = document.createElement('span');
    viewport.className = 'sprite-viewport';
    const image = document.createElement('img');
    image.crossOrigin = 'anonymous';
    image.className = 'sprite-sheet';
    image.alt = skin.name;
    image.draggable = false;
    viewport.append(image);
    host.append(viewport);
    let mask: HitMask | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let sequence = 0;
    const stop = () => {
      sequence++;
      clearInterval(timer);
    };
    const play = async (name: string, abort: AbortSignal) => {
      stop();
      const current = sequence;
      const sprite =
        model.animations[Object.hasOwn(model.aliases, name) ? model.aliases[name]! : name];
      if (!sprite) throw new Error(`PNG 动作不存在：${name}`);
      const pending = AbortSignal.any([abort, signal]);
      pending.throwIfAborted();
      const cancel = () => {
        if (sequence === current) {
          image.removeAttribute('src');
          mask = undefined;
        }
      };
      if (image.src !== sprite.url || !image.complete || !image.naturalWidth) {
        pending.addEventListener('abort', cancel, { once: true });
        image.src = sprite.url;
        mask = undefined;
        try {
          await image.decode();
        } finally {
          pending.removeEventListener('abort', cancel);
        }
      }
      pending.throwIfAborted();
      if (abort.aborted || signal.aborted || sequence !== current) return;
      const ratio = sprite.width / sprite.height,
        rows = Math.ceil(sprite.frames / sprite.columns);
      viewport.style.width = ratio >= 1 ? '100%' : `${ratio * 100}%`;
      viewport.style.height = ratio >= 1 ? `${100 / ratio}%` : '100%';
      image.style.width = `${sprite.columns * 100}%`;
      image.style.height = `${rows * 100}%`;
      const start = performance.now();
      let lastFrame = -1;
      const tick = () => {
        const frame = Math.floor(((performance.now() - start) * sprite.fps) / 1000) % sprite.frames;
        if (lastFrame === frame) return;
        lastFrame = frame;
        image.style.transform = `translate(${(-100 * (frame % sprite.columns)) / sprite.columns}%, ${(-100 * Math.floor(frame / sprite.columns)) / rows}%)`;
        mask = sample((context, size) => {
          const width = size * Math.min(1, ratio),
            height = size * Math.min(1, 1 / ratio);
          context.drawImage(
            image,
            (frame % sprite.columns) * sprite.width,
            Math.floor(frame / sprite.columns) * sprite.height,
            sprite.width,
            sprite.height,
            (size - width) / 2,
            (size - height) / 2,
            width,
            height,
          );
        });
      };
      tick();
      if (sprite.frames > 1) timer = setInterval(tick, 1000 / sprite.fps);
    };
    try {
      const first = skin.bindings.idle || skin.actions[0]!.name;
      await play(first, signal);
      signal.throwIfAborted();
      return {
        hitMask: () => mask,
        play,
        stop,
        dispose: () => {
          stop();
          mask = undefined;
          image.removeAttribute('src');
          viewport.remove();
        },
      };
    } catch (error) {
      stop();
      image.removeAttribute('src');
      viewport.remove();
      throw error;
    }
  },
};
