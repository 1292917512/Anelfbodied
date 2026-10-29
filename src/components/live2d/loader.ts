import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { z } from 'zod';
import { skinSchema } from '../../model/schema';
import { configSchema, modelSchema, type Live2dModel, type Live2dSource } from './schema';
import { registerActions, type SkinLoader } from '../../model/loader';
import { waveDuration } from './sound-info';

export const live2dLoader: SkinLoader = {
  id: 'live2d',
  name: 'Live2D Cubism',
  detect(files, assets) {
    const models = files.filter((file) => file.endsWith('.model3.json'));
    if (models.length > 1) throw new Error('文件夹中有多个模型，请在 manifest.json 中指定模型');
    const file = models[0];
    if (!file) return;
    const digest = createHash('sha256').update(assets.read(file)).digest('hex').slice(0, 12);
    return skinSchema.parse({
      version: 2,
      type: 'live2d',
      id: 'live2d-' + digest,
      name: file.replace('.model3.json', '').slice(0, 60),
      model: { file },
    });
  },
  load(manifest, assets) {
    const { file, view, notices } = configSchema.parse(manifest.model);
    const model = modelSchema.parse(assets.json(file));
    const base = posix.dirname(file);
    const path = (name: string) => posix.join(base, name);
    const refs = model.FileReferences;
    if (!refs.Moc.endsWith('.moc3')) throw new Error('需要 Cubism 3+ 的 .moc3 模型');
    assets.read(path(refs.Moc));
    refs.Textures.forEach((texture) => assets.image(path(texture)));
    for (const item of [refs.Physics, refs.Pose, refs.UserData, refs.DisplayInfo])
      if (item) assets.json(path(item));
    const sources: Record<string, Live2dSource> = Object.create(null);
    const actions = [];
    let idle: string | undefined;
    for (const [group, motions] of Object.entries(refs.Motions)) {
      for (const [index, motion] of motions.entries()) {
        const name = `motion/${group}/${index}`;
        const duration = motion.File
          ? z
              .object({ Meta: z.object({ Duration: z.number().nonnegative().max(3600) }) })
              .parse(assets.json(path(motion.File))).Meta.Duration * 1000
          : 0;
        const voiceDuration = motion.Sound
          ? (waveDuration(assets.read(path(motion.Sound))) ?? (duration || 8000))
          : 0;
        const kind = motion.File ? 'motion' : 'sound';
        sources[name] = {
          kind,
          file: motion.File ? assets.url(path(motion.File)) : undefined,
          sound: motion.Sound ? assets.url(path(motion.Sound)) : undefined,
          fadeIn: motion.FadeInTime,
          fadeOut: motion.FadeOutTime,
        };
        actions.push({
          name,
          description: motion.Text || `${group} · ${index + 1}`,
          kind,
          durationMs: Math.min(
            120000,
            Math.max(100, Math.round(Math.max(duration, voiceDuration))),
          ),
        });
        if (group.toLowerCase() === 'idle') idle ??= name;
      }
    }
    for (const expression of refs.Expressions) {
      const name = `expression/${expression.Name}`;
      if (sources[name]) throw new Error(`重复表情名称：${expression.Name}`);
      const data = z
        .object({ Meta: z.object({ Duration: z.number().nonnegative().max(3600) }).optional() })
        .parse(assets.json(path(expression.File)));
      const kind = data.Meta ? 'motion' : 'expression';
      sources[name] = { kind, file: assets.url(path(expression.File)) };
      actions.push({
        name,
        description: expression.Name,
        kind,
        durationMs: data.Meta
          ? Math.min(120000, Math.max(100, Math.round(data.Meta.Duration * 1000)))
          : 2000,
      });
    }
    const registered = registerActions(manifest, actions, idle ? { idle } : {});
    return {
      notices,
      model: {
        url: assets.url(file),
        view,
        sources,
        aliases: registered.aliases,
      } satisfies Live2dModel,
      actions: registered.actions,
      bindings: registered.bindings,
    };
  },
};
