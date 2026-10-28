import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';
import { connectionSchema, type ConnectionConfig } from '../integrations/anelf/schema';
import type { SettingsView } from '../contracts/client';

export interface SecretCodec {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(buffer: Buffer): string;
}
const settingsSchema = z.object({
  version: z.literal(1),
  connection: connectionSchema.omit({ token: true }),
  secret: z.string().optional(),
});
export class Settings {
  private config: ConnectionConfig = {
    baseUrl: 'http://127.0.0.1:8091',
    token: '',
    userId: 'desktop_pet',
    sessionId: 'companion',
  };
  constructor(
    private readonly file: string,
    private readonly codec: SecretCodec,
  ) {
    if (!existsSync(file)) return;
    const saved = settingsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    this.config = {
      ...saved.connection,
      token: saved.secret ? codec.decrypt(Buffer.from(saved.secret, 'base64')) : '',
    };
  }
  get(): ConnectionConfig {
    return { ...this.config };
  }
  view(): SettingsView {
    const { token, ...rest } = this.config;
    return { ...rest, hasToken: Boolean(token) };
  }
  save(input: unknown): void {
    const { clearToken, ...next } = connectionSchema
      .extend({ clearToken: z.boolean().default(false) })
      .parse(input);
    if (clearToken) next.token = '';
    else if (!next.token && next.baseUrl === this.config.baseUrl) next.token = this.config.token;
    const { token, ...connection } = next;
    const secret =
      token && this.codec.available() ? this.codec.encrypt(token).toString('base64') : undefined;
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ version: 1, connection, secret }), {
      mode: 0o600,
    });
    renameSync(`${this.file}.tmp`, this.file);
    this.config = next;
  }
}
