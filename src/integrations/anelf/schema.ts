import { z } from 'zod';

export const connectionSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    }, 'Use an HTTP(S) base URL without credentials or query')
    .transform((value) => new URL(value).href.replace(/\/$/, '')),
  token: z.string().max(4096).default(''),
  userId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^#\s]+$/)
    .default('desktop_pet'),
  sessionId: z.string().min(1).max(128).default('companion'),
  skillName: z
    .string()
    .trim()
    .max(64)
    .regex(/^$|^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/, '请输入有效的 Anelf 技能名称')
    .default(''),
});
export type ConnectionConfig = z.infer<typeof connectionSchema>;
