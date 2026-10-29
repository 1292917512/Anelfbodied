/** Tracks display size without recreating the model or its WebGL context. */
export function canvasResolution(canvas: HTMLCanvasElement, host: HTMLElement, limit: number) {
  let width = host.clientWidth;
  const observer = new ResizeObserver(([entry]) => {
    if (entry) width = entry.contentRect.width;
  });
  observer.observe(host);
  return {
    update() {
      const edge = Math.min(limit, Math.max(256, Math.ceil((width * devicePixelRatio) / 64) * 64));
      if (canvas.width !== edge) canvas.width = canvas.height = edge;
    },
    dispose() {
      observer.disconnect();
    },
  };
}
