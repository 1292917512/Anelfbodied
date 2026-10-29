import { z } from 'zod';
import type { BehaviorInfo } from '../behavior/registry';
export const modelActionName = z
  .string()
  .min(1)
  .max(120)
  .refine(
    (value) => [...value].every((char) => char.charCodeAt(0) >= 32),
    'Action names cannot contain control characters',
  );
export interface ModelAction {
  name: string;
  description: string;
  kind: string;
  durationMs: number;
}
export interface ModelCapabilities {
  skinId: string;
  name: string;
  type: string;
  revision: string;
  status: 'loading' | 'ready' | 'error';
  detail?: string;
  actions: ModelAction[];
  bindings: Record<string, string>;
  behaviors?: BehaviorInfo[];
}
export const modelStatusSchema = z
  .object({
    revision: z.string().min(1).max(100),
    status: z.enum(['loading', 'ready', 'error']),
    detail: z.string().max(500).optional(),
  })
  .strict();
