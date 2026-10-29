import type { ModelRenderer } from './renderer';

export class RendererRegistry {
  private readonly renderers = new Map<string, ModelRenderer>();
  register(renderer: ModelRenderer): this {
    if (this.renderers.has(renderer.type)) throw new Error(`Duplicate renderer: ${renderer.type}`);
    this.renderers.set(renderer.type, renderer);
    return this;
  }
  get(type: string): ModelRenderer {
    const renderer = this.renderers.get(type);
    if (!renderer) throw new Error(`未注册渲染器：${type}`);
    return renderer;
  }
}
