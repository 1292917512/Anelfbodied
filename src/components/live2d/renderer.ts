import type { ModelRenderer } from '../../model/renderer';
import { loadCubismCore } from './core';

export const live2dRenderer: ModelRenderer = {
  type: 'live2d',
  async mount(...args) {
    await loadCubismCore();
    args[2].throwIfAborted();
    return (await import('./cubism')).live2dRenderer.mount(...args);
  },
};
