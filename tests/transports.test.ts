import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Controller } from '../src/runtime/controller';
import { Journal } from '../src/runtime/journal';
import { startServer, type LocalServer } from '../src/transports/http';
import { PROTOCOL } from '../src/protocol/schema';

const token = 'test-token-with-at-least-24-characters';
let local: LocalServer | undefined;
let controller: Controller;
afterEach(async () => {
  await controller?.close();
  await local?.close();
  local = undefined;
});
describe('HTTP and real MCP transport', () => {
  it('shares command identity and receipts across both transports', async () => {
    let calls = 0;
    controller = new Controller(
      {
        execute: async () => {
          calls++;
          return { outcome: 'completed' };
        },
      },
      new Journal(),
    );
    local = await startServer(controller, token);
    const input = {
      protocol: PROTOCOL,
      id: 'shared',
      session: 'client',
      expiresAt: Date.now() + 30000,
      commands: [{ action: 'say', text: '你好', durationMs: 300 }],
    };
    const response = await fetch(`${local.url}/v1/commands`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(202);
    const client = new Client({ name: 'integration-test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${local.url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain('pet_cancel');
      const result = await client.callTool({ name: 'pet_execute', arguments: input });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ status: 'completed' });
      expect(calls).toBe(1);
    } finally {
      await client.close();
    }
  });
  it('enforces authentication, rejects browser origins and malformed commands', async () => {
    controller = new Controller({ execute: async () => ({ outcome: 'completed' }) }, new Journal());
    local = await startServer(controller, token);
    expect((await fetch(`${local.url}/v1/capabilities`)).status).toBe(401);
    expect(
      (
        await fetch(`${local.url}/v1/capabilities`, {
          headers: { Authorization: `Bearer ${token}`, Origin: 'https://other.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${local.url}/v1/commands`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await fetch(`${local.url}/v1/commands`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${local.url}/v1/commands`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'a'.repeat(70000) }),
        })
      ).status,
    ).toBe(413);
  });
  it('cancels a running MCP action through HTTP and returns the terminal receipt', async () => {
    controller = new Controller(
      {
        execute: (_action, signal) =>
          new Promise((resolve) =>
            signal.addEventListener('abort', () => resolve({ outcome: 'cancelled' }), {
              once: true,
            }),
          ),
      },
      new Journal(),
    );
    local = await startServer(controller, token);
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${local.url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    try {
      const pending = client.callTool({
        name: 'pet_execute',
        arguments: {
          protocol: PROTOCOL,
          id: 'cancel',
          session: 'client',
          expiresAt: Date.now() + 30000,
          commands: [{ action: 'ask', question: 'Hello?', durationMs: 30000 }],
        },
      });
      for (let count = 0; count < 100 && !controller.get('external', 'cancel'); count++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      const response = await fetch(`${local.url}/v1/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'cancel' }),
      });
      expect(response.status).toBe(200);
      expect((await pending).structuredContent).toMatchObject({ status: 'cancelled' });
    } finally {
      await client.close();
    }
  });
  it('injects MCP SDK abort into the shared controller and clears the running action', async () => {
    let cancelled = false;
    controller = new Controller(
      {
        execute: (_action, signal) =>
          new Promise((resolve) =>
            signal.addEventListener(
              'abort',
              () => {
                cancelled = true;
                resolve({ outcome: 'cancelled' });
              },
              { once: true },
            ),
          ),
      },
      new Journal(),
    );
    local = await startServer(controller, token);
    const client = new Client({ name: 'sdk-cancel', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(`${local.url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    try {
      const abort = new AbortController();
      const pending = client
        .callTool(
          {
            name: 'pet_execute',
            arguments: {
              protocol: PROTOCOL,
              id: 'sdk-abort',
              session: 'client',
              expiresAt: Date.now() + 30000,
              commands: [{ action: 'ask', question: 'Hello?', durationMs: 30000 }],
            },
          },
          undefined,
          { signal: abort.signal },
        )
        .catch((error) => error);
      await expect.poll(() => controller.get('external', 'sdk-abort')?.status).toBe('running');
      abort.abort();
      await pending;
      await expect.poll(() => cancelled).toBe(true);
      expect((await controller.wait('external', 'sdk-abort')).status).toBe('cancelled');
      await transport.terminateSession();
    } finally {
      await client.close();
    }
  });
});
