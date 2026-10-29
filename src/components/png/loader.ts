import { z } from 'zod';
import { animationSchema, normalizePngManifest, type Sprite, type PngModel } from './schema';
import { registerActions, type SkinLoader } from '../../model/loader';
export const pngLoader: SkinLoader = {
  id: 'png',
  name: 'PNG / 序列帧',
  normalize: normalizePngManifest,
  load(manifest, assets) {
    const config = z
      .object({ animations: z.record(z.string(), animationSchema) })
      .strict()
      .parse(manifest.model);
    const animations: Record<string, Sprite> = Object.create(null);
    const sources = Object.entries(config.animations).map(([name, spec]) => {
      const size = assets.image(spec.file),
        rows = Math.ceil(spec.frames / spec.columns);
      if (spec.columns > spec.frames || size.width % spec.columns || size.height % rows)
        throw new Error('序列帧的尺寸、列数或帧数不匹配');
      animations[name] = {
        ...spec,
        url: assets.url(spec.file),
        width: size.width / spec.columns,
        height: size.height / rows,
      };
      return {
        name,
        description: name,
        kind: spec.frames > 1 ? 'animation' : 'pose',
        durationMs: Math.max(100, Math.round((spec.frames / spec.fps) * 1000)),
      };
    });
    if (!sources.length) throw new Error('PNG 皮肤至少需要一个动画');
    const defaults = Object.fromEntries(sources.map(({ name }) => [name, name]));
    defaults.idle ??= sources[0]!.name;
    const { actions, bindings, aliases } = registerActions(manifest, sources, defaults);
    return {
      model: { animations, aliases } satisfies PngModel,
      actions,
      bindings,
      preview: animations[aliases[bindings.idle ?? ''] ?? bindings.idle ?? sources[0]!.name],
    };
  },
};
