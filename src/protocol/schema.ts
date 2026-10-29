import { z } from 'zod';
import { modelActionName } from './model';

export const PROTOCOL = 'desktop-pet/1' as const;
const identifier = z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/);
export const actionSchemas = {
  perform: z
    .object({
      action: z.literal('perform'),
      name: modelActionName,
      revision: identifier,
      durationMs: z.number().int().min(100).max(120000).default(2000),
    })
    .strict(),
  say: z
    .object({
      action: z.literal('say'),
      text: z.string().min(1).max(4000),
      durationMs: z.number().int().min(300).max(60000).default(6000),
    })
    .strict(),
  emote: z
    .object({
      action: z.literal('emote'),
      name: z.enum(['neutral', 'happy', 'thinking', 'sleepy', 'surprised']),
      durationMs: z.number().int().min(100).max(30000).default(2000),
    })
    .strict(),
  move: z
    .object({
      action: z.literal('move'),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      durationMs: z.number().int().min(100).max(10000).default(1000),
    })
    .strict(),
  ask: z
    .object({
      action: z.literal('ask'),
      question: z.string().min(1).max(1000),
      options: z.array(z.string().min(1).max(100)).max(5).default([]),
      durationMs: z.number().int().min(1000).max(120000).default(60000),
    })
    .strict(),
};
export const actionSchema = z.discriminatedUnion('action', [
  actionSchemas.say,
  actionSchemas.emote,
  actionSchemas.move,
  actionSchemas.ask,
  actionSchemas.perform,
]);
export const commandSchema = z
  .object({
    protocol: z.literal(PROTOCOL),
    id: identifier,
    session: identifier,
    expiresAt: z.number().int().positive(),
    commands: z.array(actionSchema).min(1).max(16),
  })
  .strict();
export const cancelSchema = z
  .object({ id: identifier.optional(), session: identifier.optional() })
  .strict()
  .refine((value) => Boolean(value.id || value.session), 'id or session is required');
export const statusSchema = z.enum([
  'accepted',
  'running',
  'completed',
  'cancelled',
  'failed',
  'unknown',
]);
export const actionResultSchema = z
  .object({
    outcome: z.enum(['completed', 'cancelled', 'failed', 'unknown']),
    answer: z.string().max(4000).optional(),
    detail: z.string().max(500).optional(),
  })
  .strict();
export const receiptSchema = z
  .object({
    protocol: z.literal(PROTOCOL),
    id: identifier,
    session: identifier,
    status: statusSchema,
    completed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    results: z.array(actionResultSchema).max(16),
    updatedAt: z.number(),
    detail: z.string().max(500).optional(),
  })
  .strict();
export type Action = z.infer<typeof actionSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type ActionResult = z.infer<typeof actionResultSchema>;
export type Cancel = z.infer<typeof cancelSchema>;
export const terminal = (receipt: Receipt): boolean =>
  !['accepted', 'running'].includes(receipt.status);
export const capabilities = () => ({
  protocol: PROTOCOL,
  actions: Object.values(actionSchemas).map((schema) => z.toJSONSchema(schema)),
  limits: { batch: 16, queue: 32, maxLifetimeMs: 300000 },
});

export class ControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}
