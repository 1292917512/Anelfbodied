import { z } from 'zod';
import {
  connectionSchema,
  type ConnectionConfig,
  type ConnectionState,
} from '../integrations/anelf/schema';

export interface SettingsView extends Omit<ConnectionConfig, 'token'> {
  hasToken: boolean;
}
export const configureConnectionSchema = z
  .object({
    baseUrl: connectionSchema.shape.baseUrl.optional(),
    token: connectionSchema.shape.token.removeDefault().optional(),
    userId: connectionSchema.shape.userId.removeDefault().optional(),
    sessionId: connectionSchema.shape.sessionId.removeDefault().optional(),
    skillName: connectionSchema.shape.skillName.removeDefault().optional(),
    clearToken: z.boolean().optional(),
    connect: z.boolean().default(true),
    expectedRevision: z.string().optional(),
  })
  .strict();
export type ConfigureConnection = z.input<typeof configureConnectionSchema>;
export const connectionActionSchema = z.enum(['connect', 'disconnect', 'stop']);
export type ConnectionAction = z.infer<typeof connectionActionSchema>;
export interface ConnectionOverview {
  settings: SettingsView;
  revision: string;
  updating: boolean;
  connection: Pick<ConnectionState, 'status' | 'detail' | 'busy'>;
}
export interface ConnectionControl {
  snapshot(): ConnectionOverview;
  configure(input: ConfigureConnection, signal?: AbortSignal): Promise<ConnectionOverview>;
  control(action: ConnectionAction, signal?: AbortSignal): Promise<ConnectionOverview>;
}
