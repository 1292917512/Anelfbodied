import { alphaMask, type HitMask } from './hit-mask';

/** Downsamples rendered opacity without retaining full-resolution pixel buffers. */
export function alphaSampler() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建模型命中画布');
  return (draw: (context: CanvasRenderingContext2D, size: number) => void): HitMask => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    draw(context, canvas.width);
    return alphaMask(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
  };
}
