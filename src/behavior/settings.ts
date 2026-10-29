import { z } from 'zod';
import type { BehaviorInfo } from './registry';
import { modelActionName } from '../protocol/model';

export const bindingPatchSchema = z
  .object({
    skinId: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    patch: z.record(
      z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
      z.union([modelActionName, z.literal(''), z.null()]),
    ),
  })
  .strict();
export type BindingPatch = z.infer<typeof bindingPatchSchema>;
export interface BehaviorSettings {
  presets: BehaviorInfo[];
  defaults: Record<string, string>;
  overrides: Record<string, string>;
}
