import { createHash } from 'node:crypto';
import { z } from 'zod';
import { skinSchema, assetPath } from '../../../model/schema';
import type { ModelSource } from '../../../model/source';

/** Creates a virtual Cubism resource view from the supported ViewerEX data fields. */
export function normalizePackage(
  input: Record<string, unknown>,
  read: (path: string) => Buffer,
  info: { name: string; author?: string; id: string },
): ModelSource {
  if (input.Version !== 3) throw new Error('此资源不是 Cubism 3+ 模型；暂不支持 Cubism 2 或 Spine');
  const refs = z.record(z.string(), z.unknown()).parse(input.FileReferences);
  const mapping = new Map<string, string>();
  let commands = 0;
  const resource = (source: unknown, extension: string) => {
    const file = assetPath.parse(source);
    const target = createHash('sha256').update(file).digest('hex').slice(0, 24) + extension;
    mapping.set(target, file);
    return target;
  };
  const model = {
    Version: 3,
    FileReferences: {
      Moc: resource(refs.Moc, '.moc3'),
      Textures: z
        .array(z.string())
        .min(1)
        .max(32)
        .parse(refs.Textures)
        .map((path) => resource(path, '.png')),
      ...Object.fromEntries(
        ['Physics', 'Pose', 'UserData', 'DisplayInfo'].flatMap((key) =>
          refs[key] ? [[key, resource(refs[key], '.json')]] : [],
        ),
      ),
      Motions: Object.fromEntries(
        Object.entries(
          z
            .record(z.string(), z.array(z.record(z.string(), z.unknown())))
            .parse(refs.Motions ?? {}),
        ).map(([group, motions]) => [
          group,
          motions
            .filter((motion) => {
              if (motion.Command || motion.PostCommand || motion.Choices) commands++;
              return !!(motion.File || motion.Sound);
            })
            .map((motion) => ({
              ...(motion.File ? { File: resource(motion.File, '.motion3.json') } : {}),
              ...(motion.Sound ? { Sound: resource(motion.Sound, '.audio') } : {}),
              ...(typeof motion.Text === 'string' ? { Text: motion.Text.slice(0, 300) } : {}),
              ...(typeof motion.FadeInTime === 'number' ? { FadeInTime: motion.FadeInTime } : {}),
              ...(typeof motion.FadeOutTime === 'number'
                ? { FadeOutTime: motion.FadeOutTime }
                : {}),
            })),
        ]),
      ),
      Expressions: z
        .array(z.object({ Name: z.string(), File: z.string() }))
        .parse(refs.Expressions ?? [])
        .map((expression) => ({
          Name: expression.Name,
          File: resource(expression.File, '.exp3.json'),
        })),
    },
    ...(input.Groups ? { Groups: input.Groups } : {}),
    ...(input.Layout ? { Layout: input.Layout } : {}),
  };
  const bytes = Buffer.from(JSON.stringify(model));
  return {
    manifest: skinSchema.parse({
      version: 2,
      id: `live2d-${info.id}`,
      name: info.name.slice(0, 60),
      author: info.author?.slice(0, 100),
      type: 'live2d',
      model: {
        file: 'model.model3.json',
        notices: commands
          ? [
              '此模型包含 ViewerEX 专用指令或选项；这些条目不执行，仅注册可独立播放的动作、表情和语音。',
            ]
          : [],
      },
    }),
    read(path) {
      if (path === 'model.model3.json') return bytes;
      const source = mapping.get(path);
      if (!source) throw new Error('模型没有声明此资源');
      return read(source);
    },
  };
}
