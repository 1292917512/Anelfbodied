import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  configureConnectionSchema,
  type ConnectionAction,
  type ConnectionControl,
  type ConnectionOverview,
  type SettingsView,
} from '../contracts/connection';
import type { ConnectionConfig, ConnectionState } from '../integrations/anelf/schema';

interface SettingsStore {
  get(): ConnectionConfig;
  view(): SettingsView;
  save(input: unknown): void;
}
interface Channel {
  snapshot(): ConnectionState;
  connect(config: ConnectionConfig, signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  stop(signal?: AbortSignal): Promise<void>;
  on(event: 'state', listener: () => void): unknown;
  off(event: 'state', listener: () => void): unknown;
}

/** Serializes channel changes from the UI and authenticated control clients. */
export class ConnectionService extends EventEmitter implements ConnectionControl {
  private currentRevision = randomUUID();
  private active?: AbortController;
  private finished = Promise.resolve();
  private closed = false;
  private readonly disconnectReason = new Error('连接已取消');
  constructor(
    private readonly settings: SettingsStore,
    private readonly channel: Channel,
  ) {
    super();
  }
  get revision(): string {
    return this.currentRevision;
  }
  get updating(): boolean {
    return Boolean(this.active);
  }
  snapshot(): ConnectionOverview {
    const { status, detail, busy } = this.channel.snapshot();
    return {
      settings: this.settings.view(),
      revision: this.revision,
      updating: this.updating,
      connection: { status, detail, busy },
    };
  }
  async configure(input: unknown, signal?: AbortSignal): Promise<ConnectionOverview> {
    const { connect, expectedRevision, ...patch } = configureConnectionSchema.parse(input);
    return this.run(async (signal) => {
      if (expectedRevision && expectedRevision !== this.revision)
        throw new Error('连接配置已变化，请读取最新配置后重试');
      if (this.channel.snapshot().busy) throw new Error('频道正在回复，请先停止当前会话再修改连接');
      const previous = this.settings.get();
      const next = { ...previous, ...patch, token: patch.token ?? '' };
      if (!connect) await this.channel.disconnect();
      signal.throwIfAborted();
      this.settings.save(next);
      const changed = JSON.stringify(previous) !== JSON.stringify(this.settings.get());
      if (changed) this.currentRevision = randomUUID();
      this.emit('state');
      if (connect && (changed || this.channel.snapshot().status !== 'online'))
        await this.connect(signal);
    }, signal);
  }
  async control(action: ConnectionAction, signal?: AbortSignal): Promise<ConnectionOverview> {
    if (this.closed) throw new Error('客户端正在退出');
    signal?.throwIfAborted();
    if (action === 'disconnect' && this.active) {
      this.active.abort(this.disconnectReason);
      await this.finished;
      return this.snapshot();
    }
    return this.run(async (signal) => {
      if (action === 'disconnect') await this.channel.disconnect();
      else if (action === 'stop') await this.channel.stop(signal);
      else {
        if (this.channel.snapshot().status === 'online') return;
        if (this.channel.snapshot().busy)
          throw new Error('频道正在回复，请先停止当前会话再重新连接');
        await this.connect(signal);
      }
    }, signal);
  }
  private async connect(signal: AbortSignal): Promise<void> {
    await this.channel.connect(this.settings.get(), signal);
    await new Promise<void>((resolve, reject) => {
      const done = (error?: unknown) => {
        this.channel.off('state', changed);
        signal.removeEventListener('abort', aborted);
        if (error) reject(error);
        else resolve();
      };
      const changed = () => {
        if (['online', 'error', 'reconnecting'].includes(this.channel.snapshot().status)) done();
      };
      const aborted = () => done(signal.reason);
      this.channel.on('state', changed);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
      else changed();
    });
  }
  private async run(
    operation: (signal: AbortSignal) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ConnectionOverview> {
    if (this.closed) throw new Error('客户端正在退出');
    if (this.active) throw new Error('连接配置正在更新，请稍后重试');
    signal?.throwIfAborted();
    this.active = new AbortController();
    const abort = this.active;
    const combined = AbortSignal.any([
      this.active.signal,
      AbortSignal.timeout(30000),
      ...(signal ? [signal] : []),
    ]);
    let finish!: () => void;
    this.finished = new Promise((resolve) => {
      finish = resolve;
    });
    this.emit('state');
    try {
      await operation(combined);
      combined.throwIfAborted();
    } catch (error) {
      if (combined.aborted) await this.channel.disconnect();
      if (abort.signal.reason !== this.disconnectReason) throw error;
    } finally {
      this.active = undefined;
      finish();
      this.emit('state');
    }
    return this.snapshot();
  }
  async close(): Promise<void> {
    this.closed = true;
    this.active?.abort();
    await this.finished;
    await this.channel.disconnect();
  }
}
