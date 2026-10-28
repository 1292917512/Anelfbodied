import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionService } from '../src/application/connection';
import { Settings } from '../src/host/settings';
import type { ConnectionState } from '../src/integrations/anelf/schema';

class Channel extends EventEmitter {
  status: ConnectionState['status'] = 'offline';
  next: ConnectionState['status'] = 'online';
  busy = false;
  connections = 0;
  snapshot(): ConnectionState {
    return {
      status: this.status,
      detail: this.status === 'error' ? '认证失败' : '',
      busy: this.busy,
      messages: [],
      draft: '',
      session: 'test',
    };
  }
  async connect() {
    this.connections++;
    this.status = this.next;
    this.emit('state');
  }
  async disconnect() {
    this.status = 'offline';
    this.busy = false;
    this.emit('state');
  }
  async stop() {
    this.busy = false;
    this.emit('state');
  }
}
const services: ConnectionService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
});
function fixture() {
  const file = join(mkdtempSync(join(tmpdir(), 'anelf-connection-')), 'settings.json');
  const settings = new Settings(file, {
    available: () => true,
    encrypt: (text) => Buffer.from(text.split('').reverse().join('')),
    decrypt: (buffer) => buffer.toString().split('').reverse().join(''),
  });
  const channel = new Channel();
  const service = new ConnectionService(settings, channel);
  services.push(service);
  return { service, settings, channel, file };
}
describe('shared connection management', () => {
  it('keeps configuration pending while history synchronizes and returns the final failure', async () => {
    const f = fixture();
    f.channel.next = 'syncing';
    let completed = false;
    const pending = f.service.configure({ userId: 'saved-user' }).then((result) => {
      completed = true;
      return result;
    });
    await expect.poll(() => f.service.snapshot().connection.status).toBe('syncing');
    expect(completed).toBe(false);
    expect(f.service.snapshot().updating).toBe(true);
    f.channel.status = 'error';
    f.channel.emit('state');
    expect(await pending).toMatchObject({
      updating: false,
      settings: { userId: 'saved-user' },
      connection: { status: 'error' },
    });
    expect(f.channel.listenerCount('state')).toBe(0);
  });
  it('patches only supplied fields and never exposes or transfers a secret to another endpoint', async () => {
    const f = fixture();
    await f.service.configure({
      baseUrl: 'https://first.example/',
      token: 'private-token',
      userId: 'custom-user',
      sessionId: 'custom-session',
      skillName: 'anelfbodied-control',
    });
    const view = await f.service.configure({ sessionId: 'next-session' });
    expect(view.settings).toEqual({
      baseUrl: 'https://first.example',
      hasToken: true,
      userId: 'custom-user',
      sessionId: 'next-session',
      skillName: 'anelfbodied-control',
    });
    expect(f.settings.get().token).toBe('private-token');
    expect(JSON.stringify(view)).not.toContain('private-token');
    expect(readFileSync(f.file, 'utf8')).not.toContain('private-token');
    const changed = await f.service.configure({
      baseUrl: 'https://second.example',
      connect: false,
    });
    expect(changed.connection.status).toBe('offline');
    expect(changed.settings.hasToken).toBe(false);
    expect(f.settings.get().token).toBe('');
    await f.service.configure({ skillName: '', connect: false });
    expect(f.settings.get().skillName).toBe('');
  });
  it('rejects stale edits and busy conversations without changing saved settings', async () => {
    const f = fixture();
    const original = f.service.snapshot().revision;
    await f.service.configure({ userId: 'agent-edit', connect: false });
    await expect(
      f.service.configure({ userId: 'stale-ui-edit', expectedRevision: original }),
    ).rejects.toThrow('配置已变化');
    f.channel.busy = true;
    await expect(f.service.configure({ userId: 'busy-edit' })).rejects.toThrow('先停止');
    expect(f.settings.get().userId).toBe('agent-edit');
    await f.service.control('stop');
    expect(
      (await f.service.configure({ userId: 'after-stop', connect: false })).settings.userId,
    ).toBe('after-stop');
  });
  it('cancels pending handshakes, rejects concurrent mutations and retains already saved settings', async () => {
    const f = fixture();
    f.channel.next = 'connecting';
    const abort = new AbortController();
    const pending = f.service.configure({ userId: 'saved-before-cancel' }, abort.signal);
    const rejected = expect(pending).rejects.toThrow();
    await expect(f.service.configure({ connect: false })).rejects.toThrow('正在更新');
    abort.abort();
    await rejected;
    expect(f.service.snapshot()).toMatchObject({
      updating: false,
      settings: { userId: 'saved-before-cancel' },
      connection: { status: 'offline' },
    });
    expect(f.channel.listenerCount('state')).toBe(0);
    f.channel.next = 'online';
    expect((await f.service.control('connect')).connection.status).toBe('online');
  });
  it('reports actual authentication failures and does not reconnect an unchanged online target', async () => {
    const f = fixture();
    f.channel.next = 'error';
    expect((await f.service.configure({ token: 'invalid' })).connection).toMatchObject({
      status: 'error',
      detail: '认证失败',
    });
    f.channel.next = 'online';
    await f.service.control('connect');
    const count = f.channel.connections;
    const revision = f.service.snapshot().revision;
    await f.service.configure({});
    expect(f.channel.connections).toBe(count);
    expect(f.service.snapshot().revision).toBe(revision);
  });
  it('aborts pending work on shutdown and does not accept late configuration changes', async () => {
    const f = fixture();
    f.channel.next = 'connecting';
    const pending = f.service.control('connect');
    const rejected = expect(pending).rejects.toThrow();
    await f.service.close();
    await rejected;
    expect(f.service.snapshot().connection.status).toBe('offline');
    await expect(f.service.configure({ userId: 'late' })).rejects.toThrow('正在退出');
    expect(f.settings.get().userId).toBe('desktop_pet');
  });
  it('lets an explicit disconnect interrupt a pending connection operation', async () => {
    const f = fixture();
    f.channel.next = 'connecting';
    const pending = f.service.configure({ userId: 'saved' });
    const stopped = await f.service.control('disconnect');
    expect(stopped.connection.status).toBe('offline');
    expect((await pending).updating).toBe(false);
    expect(f.settings.get().userId).toBe('saved');
  });
});
