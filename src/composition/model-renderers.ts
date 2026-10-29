import { RendererRegistry } from '../model/registry';
import { pngRenderer } from '../components/png/renderer';
import { live2dRenderer } from '../components/live2d/renderer';
export const modelRenderers = new RendererRegistry().register(pngRenderer).register(live2dRenderer);
