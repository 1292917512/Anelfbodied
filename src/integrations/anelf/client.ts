import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { commandSchema, PROTOCOL, terminal, type Receipt } from '../../protocol/schema';
import type { Controller } from '../../runtime/controller';
import { connectionSchema, type ConnectionConfig, type ConnectionState } from './schema';
import { consumeSse } from './sse';

/** An outbound HTTP/SSE adapter; history synchronization never executes commands. */
export class AnelfClient extends EventEmitter {
  private config?: ConnectionConfig;
  private abort?: AbortController;
  private loop?: Promise<void>;
  private generation = 0;
  private turn = '';
  private stopped = false;
  private readonly reports = new Set<string>();
  private state: ConnectionState = {
    status: 'offline',
    detail: '',
    messages: [],
    draft: '',
    session: randomUUID(),
    busy: false,
  };
  constructor(
    private readonly controller: Controller,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    super();
    controller.on('receipt', (receipt: Receipt, owner: string) => {
      if (owner !== this.owner() || !terminal(receipt) || !this.reports.delete(receipt.id)) return;
      if (!this.abort?.signal.aborted)
        void this.reportReceipt(receipt.id).catch(() => {
          this.state.detail = '回执回传失败，结果已保留，可在回执页重试';
          this.notify();
        });
    });
  }
  reportableIds(): string[] {
    return this.controller
      .list(this.owner())
      .filter(terminal)
      .map((receipt) => receipt.id);
  }
  snapshot(): ConnectionState {
    return structuredClone(this.state);
  }
  private notify(): void {
    this.emit('state', this.snapshot());
  }
  private owner(): string {
    return `anelf:${createHash('sha256')
      .update(JSON.stringify([this.config?.baseUrl, this.config?.userId, this.config?.sessionId]))
      .digest('hex')}`;
  }
  async connect(input: unknown, signal?: AbortSignal): Promise<void> {
    const config = connectionSchema.parse(input);
    signal?.throwIfAborted();
    await this.disconnect();
    signal?.throwIfAborted();
    this.config = config;
    this.stopped = false;
    this.turn = '';
    this.state = {
      ...this.state,
      messages: [],
      draft: '',
      busy: false,
      session: randomUUID(),
      status: 'connecting',
      detail: '',
    };
    this.abort = new AbortController();
    this.loop = this.run(this.generation, this.abort.signal);
    this.notify();
  }
  async disconnect(): Promise<void> {
    this.generation++;
    this.abort?.abort();
    this.reports.clear();
    await this.loop;
    await this.controller.cancel(this.owner(), { session: this.state.session });
    this.state.status = 'offline';
    this.state.detail = '';
    this.state.busy = false;
    this.state.draft = '';
    this.notify();
  }
  async send(text: string): Promise<void> {
    if (this.state.status !== 'online' || this.state.busy)
      throw new Error('请等待连接或当前回复结束');
    if (!text.trim() || text.length > 16000) throw new Error('消息不能为空，最多 16000 字');
    this.state.session = randomUUID();
    this.stopped = false;
    this.turn = '';
    const id = randomUUID();
    const generation = this.generation;
    this.state.busy = true;
    this.state.draft = '';
    this.addLine(id, 'user', text);
    const instructions = `\n\n[桌宠客户端接入]\n你正在与桌宠客户端中的用户对话。可以正常回复文字。需要控制形象时，整个回复只能是一个 JSON 对象，不使用代码围栏：${JSON.stringify(
      {
        protocol: PROTOCOL,
        id: 'unique-command-id',
        session: this.state.session,
        expiresAt: Date.now() + 300000,
        commands: [
          { action: 'say', text: '你好', durationMs: 5000 },
          { action: 'emote', name: 'happy', durationMs: 1500 },
        ],
      },
    )}。id 每批唯一，重发同批保持原值。支持 say(text,durationMs)、emote(name:neutral/happy/thinking/sleepy/surprised,durationMs)、move(x,y:0到1,durationMs)、ask(question,options,durationMs)。最多16步，按顺序执行，expiresAt 不超过当前时间五分钟。需要执行结果时设置 returnReceipt:true；ask 的用户回答会自动回传。回执是事件，只在需要继续动作时响应，避免回执循环。普通回复无需协议。\n`;
    try {
      const response = await this.post('/api/chat', {
        ...this.target(),
        ...this.skillSelection(),
        message: text + instructions,
        request_id: id,
        message_id: id,
        async_mode: true,
      });
      if (generation !== this.generation) return;
      if (!['accepted', 'ok', 'duplicate'].includes(String(response.status)))
        throw new Error('消息未被受理');
    } catch {
      if (generation !== this.generation) return;
      this.state.detail = '发送结果未确认，请核对历史后再发送；不会自动重发';
      this.stopped = true;
      this.notify();
      throw new Error(this.state.detail);
    }
  }
  async stop(signal?: AbortSignal): Promise<void> {
    const session = this.state.session;
    this.stopped = true;
    this.state.session = randomUUID();
    await this.controller.cancel(this.owner(), { session });
    if (!this.config || !this.state.busy) return;
    this.state.detail = '本地动作已停止，等待 Anelf 收束';
    this.notify();
    const result = await this.post(
      '/api/sessions/control',
      {
        ...this.target(),
        action: 'stop',
        ...(this.turn ? { run_id: this.turn } : {}),
      },
      signal,
    );
    if (result.status === 'idle') {
      this.state.busy = false;
      this.state.detail = '已停止';
      this.notify();
    } else if (result.status !== 'ok') throw new Error('Anelf 未确认停止，请重试');
  }
  async reportReceipt(id: string): Promise<void> {
    const receipt = this.controller.get(this.owner(), id);
    if (!receipt || !terminal(receipt)) throw new Error('完成的回执不存在');
    const response = await this.post('/api/chat', {
      ...this.target(),
      ...this.skillSelection(),
      message: JSON.stringify({ type: 'desktop-pet.receipt', receipt }),
      kind: 'event',
      message_id: `receipt-${id}`,
      request_id: `receipt-${id}`,
      async_mode: true,
    });
    if (!['accepted', 'ok', 'duplicate'].includes(String(response.status)))
      throw new Error('回执未被受理');
  }
  private target(): object {
    return { user_id: this.config?.userId, session_id: this.config?.sessionId };
  }
  private skillSelection(): { skills?: string[] } {
    return this.config?.skillName ? { skills: [this.config.skillName] } : {};
  }
  private endpoint(path: string): URL {
    if (!this.config) throw new Error('Anelf is not configured');
    return new URL(`${this.config.baseUrl.replace(/\/$/, '')}${path}`);
  }
  private headers(): Record<string, string> {
    return this.config?.token ? { Authorization: `Bearer ${this.config.token}` } : {};
  }
  private async post(
    path: string,
    body: object,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetcher(this.endpoint(path), {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([
        this.abort?.signal ?? new AbortController().signal,
        AbortSignal.timeout(15000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }
  private async history(signal: AbortSignal, generation: number): Promise<void> {
    const url = this.endpoint('/api/sessions/history');
    url.search = new URLSearchParams({
      user_id: this.config?.userId ?? '',
      session_id: this.config?.sessionId ?? '',
      limit: '50',
    }).toString();
    const response = await this.fetcher(url, {
      headers: this.headers(),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw new Error(`History HTTP ${response.status}`);
    const data = (await response.json()) as {
      messages?: { id: string | number; role: string; content: string }[];
    };
    if (generation !== this.generation) return;
    const rows = (data.messages ?? []).filter((row) => typeof row.content === 'string').slice(-50);
    const remaining = [...this.state.messages];
    const plain = (text: string) => text.split('[桌宠客户端接入]')[0]!.trim();
    const history = rows.map((row) => {
      const line = { id: `history-${row.id}`, role: row.role, text: row.content.slice(0, 16000) };
      const found = remaining.findIndex(
        (item) =>
          item.id === line.id || (item.role === line.role && plain(item.text) === plain(line.text)),
      );
      if (found >= 0) remaining.splice(found, 1);
      return line;
    });
    this.state.messages = [...history, ...remaining].slice(-100);
  }
  private async run(generation: number, signal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (!signal.aborted) {
      try {
        const url = this.endpoint('/api/chat/stream');
        url.search = new URLSearchParams({
          user_id: this.config?.userId ?? '',
          session_id: this.config?.sessionId ?? '',
        }).toString();
        const handshake = new AbortController();
        const timer = setTimeout(() => handshake.abort(), 15000);
        const response = await this.fetcher(url, {
          headers: { ...this.headers(), Accept: 'text/event-stream' },
          signal: AbortSignal.any([signal, handshake.signal]),
        }).finally(() => clearTimeout(timer));
        if ([401, 403].includes(response.status)) {
          await response.body?.cancel();
          this.state.status = 'error';
          this.state.detail = '认证失败，请检查 API Token';
          this.notify();
          return;
        }
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
          await response.body?.cancel();
          throw new Error('Invalid SSE response');
        }
        const stream = consumeSse(response, signal, (data) => this.frame(data, generation));
        // Consume immediately so no frames are lost while history is loaded.
        const settled = stream.then(
          () => undefined,
          (error) => error as unknown,
        );
        try {
          await this.history(signal, generation);
        } catch {
          if (!signal.aborted) this.state.detail = '历史暂时不可用，已保留实时连接';
        }
        if (signal.aborted) {
          await settled;
          return;
        }
        this.state.status = 'online';
        if (this.state.busy && this.stopped)
          this.state.detail = '连接已恢复，本轮状态未确认；点击停止同步状态后可继续';
        else if (!this.state.busy) this.state.detail = '';
        this.notify();
        const started = Date.now();
        const failure = await settled;
        if (Date.now() - started > 30000) attempt = 0;
        if (failure) throw failure;
        if (!signal.aborted) throw new Error('SSE closed');
      } catch {
        if (signal.aborted || generation !== this.generation) return;
        if (this.state.busy) this.stopped = true;
        this.state.status = 'reconnecting';
        this.state.detail = '连接中断，正在恢复；已执行的动作不会重播';
        this.notify();
        await delay(
          Math.min(30000, 500 * 2 ** Math.min(attempt++, 6)) + Math.random() * 250,
          undefined,
          { signal },
        ).catch(() => {});
      }
    }
  }
  private frame(raw: string, generation: number): void {
    if (generation !== this.generation) return;
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object') return;
    if (typeof frame.session_id === 'string' && frame.session_id !== this.config?.sessionId) return;
    if (frame.type === 'delta' && !frame.reasoning && typeof frame.delta === 'string') {
      if (!this.stopped) this.state.draft = (this.state.draft + frame.delta).slice(-16000);
      if (typeof frame.turn_id === 'string') this.turn = frame.turn_id;
    }
    if (frame.type === 'reply' && typeof frame.content === 'string') this.reply(frame.content);
    if (
      frame.type === 'turn_end' &&
      (!this.turn || !frame.turn_id || frame.turn_id === this.turn)
    ) {
      this.state.busy = false;
      this.state.draft = '';
      this.state.detail =
        frame.reason === 'interrupted'
          ? 'Anelf 本轮已停止'
          : frame.error
            ? 'Anelf 本轮执行失败'
            : '';
    }
    this.notify();
  }
  private reply(text: string): void {
    const digest = createHash('sha256')
      .update(this.state.session + text)
      .digest('hex')
      .slice(0, 24);
    this.addLine(`reply-${digest}`, 'assistant', text);
    if (this.stopped) return;
    try {
      if (text.trim().startsWith('{')) {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed.protocol === PROTOCOL) {
          const command = commandSchema.parse(parsed);
          if (command.session !== this.state.session) {
            this.state.detail = '已忽略旧轮次的桌宠指令';
            return;
          }
          const existing = this.controller.get(this.owner(), command.id);
          if (
            !existing &&
            (command.returnReceipt || command.commands.some((action) => action.action === 'ask'))
          )
            this.reports.add(command.id);
          try {
            this.controller.submit(this.owner(), command);
          } catch (error) {
            this.reports.delete(command.id);
            throw error;
          }
          return;
        }
      }
      if (!this.controller.get(this.owner(), `reply-${digest}`))
        this.controller.submit(this.owner(), {
          protocol: PROTOCOL,
          id: `reply-${digest}`,
          session: this.state.session,
          expiresAt: Date.now() + 60000,
          commands: [{ action: 'say', text: text.slice(0, 4000), durationMs: 8000 }],
        });
    } catch {
      this.state.detail = '桌宠指令未执行：格式、有效期或队列状态不符合协议';
    }
  }
  private addLine(id: string, role: string, text: string): void {
    if (!this.state.messages.some((line) => line.id === id))
      this.state.messages.push({ id, role, text });
    this.state.messages = this.state.messages.slice(-100);
    this.notify();
  }
}
