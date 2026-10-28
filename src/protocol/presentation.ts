import { z } from 'zod';
import { actionSchema, actionResultSchema } from './schema';

/** Messages between a host adapter and its presentation process. */
export const presentationOrderSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('execute'), id: z.string().min(1).max(100), action: actionSchema })
    .strict(),
  z.object({ type: z.literal('cancel'), id: z.string().min(1).max(100) }).strict(),
]);
export const presentationReplySchema = z
  .object({
    id: z.string().min(1).max(100),
    result: actionResultSchema,
  })
  .strict();
export type PresentationOrder = z.infer<typeof presentationOrderSchema>;
