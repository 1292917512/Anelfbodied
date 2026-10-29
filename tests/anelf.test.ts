import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { AnelfClient } from '../src/integrations/anelf/client';
import { Controller } from '../src/runtime/controller';
import type { ActionDriver } from '../src/runtime/ports';
import { Journal } from '../src/runtime/journal';
import { PROTOCOL } from '../src/protocol/schema';
import { channelGuide } from '../src/integrations/anelf/guide';
import { mcpConfiguration } from '../src/shared/mcp-configuration';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup.length = 0;
});

async function fixture(driver: ActionDriver) {
  const streams = new Set<ServerResponse>();
  const histories = new Set<ServerResponse>();
  const requests: { path: string; data: Record<string, unknown> }[] = [];
  const state = {
    rejectAuth: false,
    dropPost: false,
    stopStatus: 'idle',
    subscriptions: 0,
    streamStatus: 200,
    streamType: 'text/event-stream',
    holdHistory: false,
    historyStatus: 200,
    history: [] as { id: number; role: string; content: string }[],
  };
  const server = createServer(async (req, res) => {
    if (state.rejectAuth || req.headers.authorization !== 'Bearer fixture-token') {
      res.writeHead(401).end();
      return;
    }
    const path = new URL(req.url!, 'http://localhost').pathname;
    if (path === '/api/chat/stream') {
      state.subscriptions++;
      if (state.streamStatus !== 200 || state.streamType !== 'text/event-stream') {
        res.writeHead(state.streamStatus, { 'Content-Type': state.streamType }).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': connected\n\n');
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }
    if (path === '/api/sessions/history') {
      if (state.holdHistory) {
        histories.add(res);
        req.on('close', () => histories.delete(res));
        return;
      }
      res.statusCode = state.historyStatus;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ messages: state.history }));
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    requests.push({ path, data: JSON.parse(raw) as Record<string, unknown> });
    if (state.dropPost && path === '/api/chat') {
      res.destroy();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: path.includes('control') ? state.stopStatus : 'accepted' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const controller = new Controller(driver, new Journal());
  const client = new AnelfClient(controller);
  cleanup.push(async () => {
    await client.disconnect();
    await controller.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const config = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: 'fixture-token',
    userId: 'pet',
    sessionId: 'desk',
  };
  const frame = (data: object) => {
    const bytes = Buffer.from(`data: ${JSON.stringify(data)}\n\n`);
    for (const stream of streams) {
      stream.write(bytes.subarray(0, bytes.length - 5));
      stream.write(bytes.subarray(bytes.length - 5));
    }
  };
  return {
    client,
    controller,
    config,
    requests,
    state,
    frame,
    reconnect: () => {
      for (const stream of streams) stream.end();
    },
    pendingHistory: () => histories.size,
  };
}

describe('Anelf HTTP channel adapter', () => {
  it.each([undefined, '', '   '])(
    'uses the default skill for %j without automatically sending setup',
    async (skillName) => {
      const f = await fixture({ execute: async () => ({ outcome: 'completed' }) });
      const local = { url: 'http://127.0.0.1:57321', token: 'desktop-control-secret' };
      await f.client.connect({ ...f.config, skillName });
      await expect.poll(() => f.client.snapshot().status).toBe('online');
      expect(f.requests).toHaveLength(0);
      await f.client.sendGuide(local);
      expect(f.requests[0]?.data).not.toHaveProperty('skills');
      expect(f.requests[0]?.data.message).toBe(channelGuide('anelfbodied-control', local));
      expect(String(f.requests[0]?.data.message)).toContain(
        JSON.stringify(mcpConfiguration(local), null, 2),
      );
      expect(String(f.requests[0]?.data.message)).toContain('set_skill_mcp_servers');
      expect(String(f.requests[0]?.data.message)).not.toContain('fixture-token');
      await expect(f.client.sendGuide(local)).rejects.toThrow('请等待');
      f.frame({ type: 'turn_end' });
      await expect.poll(() => f.client.snapshot().busy).toBe(false);
      f.reconnect();
      await expect.poll(() => f.state.subscriptions).toBe(2);
      await expect.poll(() => f.client.snapshot().status).toBe('online');
      expect(f.requests).toHaveLength(1);
      await f.client.send('你好');
      expect(f.requests.at(-1)?.data).toMatchObject({
        message: '你好',
        skills: ['anelfbodied-control'],
      });
      expect(channelGuide('custom-skill', local)).toContain('自定义技能名称');
      expect(channelGuide('custom-skill', local)).not.toContain('raw.githubusercontent.com');
      expect(channelGuide(skillName, local)).toBe(channelGuide('anelfbodied-control', local));
    },
  );

  it.each([
    [404, 'application/json', '未找到频道接口'],
    [200, 'text/html', '未返回频道事件流'],
    [503, 'application/json', 'HTTP 503'],
  ])(
    'fails an initial invalid channel response (%s, %s) until an explicit retry',
    async (status, type, detail) => {
      const f = await fixture({ execute: async () => ({ outcome: 'completed' }) });
      f.state.streamStatus = status;
      f.state.streamType = type;
      await f.client.connect(f.config);
      await expect.poll(() => f.client.snapshot().status).toBe('error');
      expect(f.client.snapshot().detail).toContain(detail);
      await new Promise((resolve) => setTimeout(resolve, 850));
      expect(f.state.subscriptions).toBe(1);
      f.state.streamStatus = 200;
      f.state.streamType = 'text/event-stream';
      await f.client.connect(f.config);
      await expect.poll(() => f.client.snapshot().status).toBe('online');
    },
  );

  it('never reports online when the stream ends during history synchronization', async () => {
    const f = await fixture({ execute: async () => ({ outcome: 'completed' }) });
    f.state.holdHistory = true;
    const states: string[] = [];
    f.client.on('state', () => states.push(f.client.snapshot().status));
    await f.client.connect(f.config);
    await expect.poll(() => f.pendingHistory()).toBe(1);
    expect(f.client.snapshot().status).toBe('syncing');
    f.reconnect();
    await expect.poll(() => f.client.snapshot().status).toBe('error');
    await expect.poll(() => f.pendingHistory()).toBe(0);
    expect(states).not.toContain('online');
    expect(states).not.toContain('reconnecting');
    f.state.holdHistory = false;
    f.state.historyStatus = 503;
    await f.client.connect(f.config);
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    expect(f.client.snapshot().detail).toContain('历史暂时不可用');
  });

  it('times out an initial silent service without starting a reconnect loop', async () => {
    vi.useFakeTimers();
    const controller = new Controller(
      { execute: async () => ({ outcome: 'completed' }) },
      new Journal(),
    );
    let calls = 0;
    const client = new AnelfClient(controller, async (_url, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
      });
    });
    try {
      await client.connect({ baseUrl: 'http://127.0.0.1:8091' });
      expect(client.snapshot().status).toBe('connecting');
      await vi.advanceTimersByTimeAsync(15000);
      expect(client.snapshot().status).toBe('error');
      expect(client.snapshot().detail).toContain('连接超时');
      await vi.advanceTimersByTimeAsync(60000);
      expect(calls).toBe(1);
    } finally {
      await client.disconnect();
      await controller.close();
      vi.useRealTimers();
    }
  });

  it('keeps skills separate from speech and never executes reply JSON or posts receipt events', async () => {
    const spoken: string[] = [];
    const f = await fixture({
      execute: async (action) => {
        if (action.action === 'say') spoken.push(action.text);
        else throw new Error(`Unexpected channel action: ${action.action}`);
        return { outcome: 'completed' };
      },
    });
    f.state.history = [{ id: 1, role: 'assistant', content: '历史不会执行' }];
    await f.client.connect({ ...f.config, skillName: 'anelfbodied-control' });
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    expect(spoken).toEqual([]);
    const message = '请解释 {"action":"ask"}，保留原文。';
    await f.client.send(message);
    expect(f.requests[0]?.data.message).toBe(message);
    expect(f.requests[0]?.data.skills).toEqual(['anelfbodied-control']);
    const command = {
      protocol: PROTOCOL,
      id: 'question',
      session: f.client.snapshot().session,
      expiresAt: Date.now() + 30000,
      commands: [{ action: 'ask', question: '继续吗？', options: ['继续'], durationMs: 1000 }],
    };
    f.frame({ type: 'tool_call', name: 'pet_execute', arguments: command });
    f.frame({ type: 'reply', content: JSON.stringify(command), session_id: 'desk' });
    await expect.poll(() => spoken).toEqual([JSON.stringify(command)]);
    expect(f.controller.list()[0]?.total).toBe(1);
    f.frame({ type: 'reply', content: JSON.stringify(command) });
    f.frame({ type: 'turn_end' });
    f.state.history.push({ id: 2, role: 'assistant', content: JSON.stringify(command) });
    f.reconnect();
    await expect.poll(() => f.state.subscriptions).toBe(2);
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    expect(spoken).toEqual([JSON.stringify(command)]);
    f.controller.submit('external', {
      ...command,
      id: 'mcp-action',
      commands: [{ action: 'say', text: 'MCP' }],
    });
    await f.controller.wait('external', 'mcp-action');
    expect(f.requests.filter((request) => request.path === '/api/chat')).toHaveLength(1);
    expect(
      f.client.snapshot().messages.filter((line) => line.text === JSON.stringify(command)),
    ).toHaveLength(1);
    await f.client.send('重连后继续');
    expect(f.requests.at(-1)?.data.skills).toEqual(['anelfbodied-control']);
    await f.client.stop();
    expect(f.requests.at(-1)?.data).not.toHaveProperty('skills');
    await f.client.connect({ ...f.config, skillName: 'another-skill' });
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    await f.client.send('切换技能');
    expect(f.requests.at(-1)?.data.skills).toEqual(['another-skill']);
    await f.client.connect({ ...f.config, skillName: '' });
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    await f.client.send('清除技能');
    expect(f.requests.at(-1)?.data.skills).toEqual(['anelfbodied-control']);
  });

  it('targets the observed Anelf run, cancels local work and rejects late replies after stopping', async () => {
    let calls = 0;
    const f = await fixture({
      execute: async (_action, signal) => {
        calls++;
        return new Promise((resolve) =>
          signal.addEventListener('abort', () => resolve({ outcome: 'cancelled' }), { once: true }),
        );
      },
    });
    await f.client.connect(f.config);
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    await f.client.send('开始');
    expect(f.requests.at(-1)?.data.skills).toEqual(['anelfbodied-control']);
    f.frame({ type: 'delta', delta: '正在准备', turn_id: 'run-one' });
    f.frame({ type: 'reply', content: '你好' });
    await expect.poll(() => calls).toBe(1);
    await f.client.stop();
    expect(f.requests.find((request) => request.path.endsWith('/control'))?.data.run_id).toBe(
      'run-one',
    );
    expect(f.controller.list()[0]?.status).toBe('cancelled');
    f.frame({ type: 'reply', content: '迟到的回复' });
    f.frame({ type: 'turn_end', turn_id: 'run-one' });
    await expect
      .poll(() => f.client.snapshot().messages.some((line) => line.text === '迟到的回复'))
      .toBe(true);
    expect(calls).toBe(1);
    await f.client.send('新任务');
    f.frame({ type: 'reply', content: '新回复' });
    await expect.poll(() => calls).toBe(2);
  });

  it('keeps uncertain sends blocked until explicit stop and stops retrying invalid credentials', async () => {
    const f = await fixture({ execute: async () => ({ outcome: 'completed' }) });
    await f.client.connect(f.config);
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    f.state.dropPost = true;
    await expect(f.client.send('发送')).rejects.toThrow('未确认');
    expect(f.client.snapshot().busy).toBe(true);
    await expect(f.client.send('不要重发')).rejects.toThrow();
    await f.client.stop();
    expect(f.client.snapshot().busy).toBe(false);
    f.state.rejectAuth = true;
    await f.client.connect(f.config);
    await expect.poll(() => f.client.snapshot().status).toBe('error');
    expect(f.client.snapshot().detail).toContain('认证失败');
  });

  it('recovers SSE while a turn is uncertain and accepts explicit synchronization', async () => {
    const f = await fixture({ execute: async () => ({ outcome: 'completed' }) });
    await f.client.connect(f.config);
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    await f.client.send('执行');
    f.reconnect();
    await expect.poll(() => f.state.subscriptions).toBe(2);
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    expect(f.client.snapshot().detail).toContain('状态未确认');
    expect(f.client.snapshot().busy).toBe(true);
    await f.client.stop();
    await f.client.send('继续');
    expect(f.client.snapshot().busy).toBe(true);
  });

  it('stops automatic recovery when the service rejects credentials', async () => {
    const f = await fixture({ execute: async () => ({ outcome: 'completed' }) });
    await f.client.connect(f.config);
    await expect.poll(() => f.client.snapshot().status).toBe('online');
    f.state.rejectAuth = true;
    f.reconnect();
    await expect.poll(() => f.client.snapshot().status).toBe('error');
    expect(f.client.snapshot().detail).toContain('认证失败');
    f.state.rejectAuth = false;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(f.state.subscriptions).toBe(1);
    expect(f.client.snapshot().status).toBe('error');
  });
});
