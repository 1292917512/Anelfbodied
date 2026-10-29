import { z } from 'zod';
import { assetPath } from '../../model/schema';
export const configSchema = z
  .object({
    file: assetPath.refine(
      (file) => file.endsWith('.model3.json'),
      '请选择 Cubism 3+ 的 .model3.json 文件',
    ),
    notices: z.array(z.string().max(500)).max(20).default([]),
    view: z
      .object({
        zoom: z.number().min(0.25).max(4).default(1),
        x: z.number().min(-2).max(2).default(0),
        y: z.number().min(-2).max(2).default(0),
      })
      .strict()
      .prefault({}),
  })
  .strict();
const reference = z.object({
  File: assetPath,
  Sound: assetPath.optional(),
  Text: z.string().max(300).optional(),
  FadeInTime: z.number().optional(),
  FadeOutTime: z.number().optional(),
});
export const modelSchema = z.object({
  Version: z.literal(3),
  FileReferences: z.object({
    Moc: assetPath,
    Textures: z.array(assetPath).min(1).max(32),
    Physics: assetPath.optional(),
    Pose: assetPath.optional(),
    UserData: assetPath.optional(),
    DisplayInfo: assetPath.optional(),
    Expressions: z.array(reference.extend({ Name: z.string().min(1).max(100) })).default([]),
    Motions: z
      .record(
        z.string(),
        z.array(
          reference
            .extend({ File: assetPath.optional() })
            .refine((motion) => motion.File || motion.Sound, '动作需要动画或语音资源'),
        ),
      )
      .default({}),
  }),
});
export interface Live2dSource {
  kind: 'motion' | 'expression' | 'sound';
  file?: string;
  sound?: string;
  fadeIn?: number;
  fadeOut?: number;
}
export interface Live2dModel {
  url: string;
  view: { zoom: number; x: number; y: number };
  sources: Record<string, Live2dSource>;
  aliases: Record<string, string>;
}
