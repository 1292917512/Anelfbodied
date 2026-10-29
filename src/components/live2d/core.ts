let loading: Promise<void> | undefined;

/** Loads Core before importing the framework's module-level constants. */
export function loadCubismCore(): Promise<void> {
  return (loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/live2dcubismcore.min.js';
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('Cubism Core 加载失败'));
    };
    document.head.append(script);
  }));
}
