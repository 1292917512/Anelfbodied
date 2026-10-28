import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { capabilities, cancelSchema, commandSchema } from '../protocol/schema';
import type { Controller } from '../runtime/controller';
import { productName, version } from '../shared/product';
import {
  configureConnectionSchema,
  connectionActionSchema,
  type ConnectionControl,
} from '../contracts/connection';

const result = (value: object) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  structuredContent: { ...value },
});

/** MCP tools delegate to the same controller as protocol messages. */
export function createMcp(
  controller: Controller,
  owner = 'external',
  connection?: ConnectionControl,
): McpServer {
  const server = new McpServer({ name: 'desktop-embodied', title: productName, version });
  server.registerTool(
    'pet_capabilities',
    { description: 'Discover supported desktop pet actions and their JSON schemas.' },
    async () => result(capabilities()),
  );
  server.registerTool(
    'pet_execute',
    {
      description:
        'Execute a desktop-pet/1 batch. Reuse the same id and payload for retries. Returns a receipt after the batch ends; status unknown requires inspection, never blind replay.',
      inputSchema: commandSchema,
    },
    async (command, extra) => {
      controller.submit(owner, command);
      const cancel = () => {
        void controller.cancel(owner, { id: command.id });
      };
      extra.signal.addEventListener('abort', cancel, { once: true });
      try {
        if (extra.signal.aborted) cancel();
        return result(await controller.wait(owner, command.id));
      } finally {
        extra.signal.removeEventListener('abort', cancel);
      }
    },
  );
  server.registerTool(
    'pet_cancel',
    {
      description:
        'Cancel by id or session, wait for actual execution cleanup, and return partial receipts. A cancelled session rejects late commands for five minutes.',
      inputSchema: cancelSchema,
    },
    async (input) => result({ receipts: await controller.cancel(owner, input) }),
  );
  server.registerTool(
    'pet_state',
    {
      description:
        'Read recent receipts or query one command. Reading a receipt never re-executes it.',
      inputSchema: z.object({ id: z.string().optional() }),
    },
    async ({ id }) =>
      result({
        receipts: id ? [controller.get(owner, id)].filter(Boolean) : controller.list(owner),
      }),
  );
  if (connection) {
    server.registerTool(
      'pet_connection_state',
      {
        description:
          'Read the saved Anelf HTTP/HTTPS channel settings and live connection status. Credentials are never returned. Read revision before editing to detect concurrent changes.',
        annotations: { readOnlyHint: true },
      },
      async () => result(connection.snapshot()),
    );
    server.registerTool(
      'pet_configure_connection',
      {
        description:
          'Patch the saved channel configuration and connect by default. Use the HTTP API channel URL and its API token, not WebUI credentials. Omitted fields stay unchanged; changing baseUrl without token clears the old credential. Use connect:false to save while disconnected. expectedRevision detects conflicting edits. Check connection.status: saved configuration does not imply an online channel. Cancellation stops connection attempts but does not undo saved settings. Stop a busy conversation before changing configuration.',
        inputSchema: configureConnectionSchema,
      },
      async (input, extra) => result(await connection.configure(input, extra.signal)),
    );
    server.registerTool(
      'pet_connection_control',
      {
        description:
          'Connect the saved Anelf channel, disconnect its event stream, or request the current conversation to stop. Disconnecting does not stop the remote agent; use stop first when needed. A stop request may still be settling: inspect busy in pet_connection_state. Connection attempts return the actual online/error/reconnecting status and support SDK cancellation.',
        inputSchema: z.object({ action: connectionActionSchema }),
      },
      async ({ action }, extra) => result(await connection.control(action, extra.signal)),
    );
  }
  return server;
}
