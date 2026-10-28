import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Controller } from '../runtime/controller';
import { createMcp } from './mcp';
import type { ConnectionControl } from '../contracts/connection';

/** Retains bounded MCP sessions so SDK cancellation reaches the original tool call. */
export function mountMcp(
  app: Express,
  controller: Controller,
  connection?: ConnectionControl,
): () => Promise<void> {
  const sessions = new Map<
    string,
    {
      transport: StreamableHTTPServerTransport;
      close(): Promise<void>;
      touched: number;
      active: number;
    }
  >();
  let initializing = 0;
  let closing = false;
  app.all('/mcp', async (req, res) => {
    if (closing) {
      res.status(503).end();
      return;
    }
    const id = req.headers['mcp-session-id'];
    if (id !== undefined) {
      const session = typeof id === 'string' ? sessions.get(id) : undefined;
      if (!session) {
        res.status(404).json({ error: 'MCP session not found; initialize again' });
        return;
      }
      if (session.active >= 32) {
        res.status(429).end();
        return;
      }
      session.touched = Date.now();
      session.active++;
      try {
        await session.transport.handleRequest(req, res, req.body);
      } finally {
        session.active--;
      }
      return;
    }
    if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'Initialize an MCP session first' });
      return;
    }
    if (sessions.size + initializing >= 16) {
      res.status(503).json({ error: 'MCP session capacity reached' });
      return;
    }
    initializing++;
    const mcp = createMcp(controller, 'external', connection);
    const session = {
      transport: new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions.set(id, session);
        },
      }),
      touched: Date.now(),
      active: 0,
      close: async () => {
        if (session.transport.sessionId) sessions.delete(session.transport.sessionId);
        await mcp.close();
      },
    };
    try {
      await mcp.connect(session.transport);
      const onclose = session.transport.onclose;
      session.transport.onclose = () => {
        onclose?.();
        if (session.transport.sessionId) sessions.delete(session.transport.sessionId);
      };
      await session.transport.handleRequest(req, res, req.body);
    } finally {
      initializing--;
      if (!session.transport.sessionId) await session.close();
    }
  });
  const timer = setInterval(() => {
    for (const session of sessions.values())
      if (!session.active && session.touched < Date.now() - 15 * 60000)
        void session.close().catch(() => {});
  }, 30000);
  timer.unref();
  return async () => {
    closing = true;
    clearInterval(timer);
    await Promise.all([...sessions.values()].map((session) => session.close()));
  };
}
