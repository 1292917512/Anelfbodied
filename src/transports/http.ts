import express from 'express';
import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { capabilities, cancelSchema, ControlError } from '../protocol/schema';
import type { Controller } from '../runtime/controller';
import { mountMcp } from './mcp-http';
import type { ConnectionControl } from '../contracts/connection';

export interface LocalServer {
  server: Server;
  url: string;
  close(): Promise<void>;
}
export async function startServer(
  controller: Controller,
  token: string,
  port = 0,
  connection?: ConnectionControl,
): Promise<LocalServer> {
  if (token.length < 24) throw new Error('Local control token must contain at least 24 characters');
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || req.headers.origin) {
      res.status(403).json({ error: 'origin_denied' });
      return;
    }
    const provided = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/v1/capabilities', (_req, res) => {
    res.json(capabilities());
  });
  app.post('/v1/commands', (req, res) => {
    res.status(202).json(controller.submit('external', req.body));
  });
  app.get('/v1/receipts', (_req, res) => {
    res.json({ receipts: controller.list('external') });
  });
  app.get('/v1/receipts/:id', (req, res) => {
    const receipt = controller.get('external', req.params.id);
    if (!receipt) throw new ControlError('not_found', 'Command not found', 404);
    res.json(receipt);
  });
  app.post('/v1/cancel', async (req, res) => {
    res.json({ receipts: await controller.cancel('external', cancelSchema.parse(req.body)) });
  });
  const closeMcp = mountMcp(app, controller, connection);
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      void _next;
      if (res.headersSent) return;
      const parseStatus =
        error &&
        typeof error === 'object' &&
        'status' in error &&
        [400, 413, 415].includes(Number(error.status))
          ? Number(error.status)
          : 500;
      const status =
        error instanceof ControlError
          ? error.httpStatus
          : error instanceof ZodError
            ? 422
            : parseStatus;
      res.status(status).json({
        error: error instanceof ControlError ? error.code : 'invalid_request',
        message:
          status === 500
            ? 'Control request failed'
            : error instanceof Error
              ? error.message
              : 'Invalid request',
      });
    },
  );
  const server = createServer(app);
  server.requestTimeout = 150000;
  server.headersTimeout = 15000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Local server did not bind a TCP port');
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await closeMcp();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
