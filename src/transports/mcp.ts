import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cancelSchema, commandSchema } from '../protocol/schema';
import type { ControlService } from '../runtime/ports';
import { productName, version } from '../shared/product';
import { mcpResult as result, type McpExtension } from './mcp-extension';

/** MCP tools delegate to the same controller as protocol messages. */
export function createMcp(
  controller: ControlService,
  owner = 'external',
  extensions: readonly McpExtension[] = [],
): McpServer {
  const server = new McpServer({ name: 'desktop-embodied', title: productName, version });
  server.registerTool(
    'pet_capabilities',
    {
      description:
        'Discover common behavior schemas and the active model: readiness, revision, all registered actions, descriptions and suggested durations. Call again after switching skins. Use perform with a discovered name and revision through pet_execute; never assume fixed motion names.',
    },
    async () => result(controller.capabilities()),
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
  extensions.forEach((register) => register(server));
  return server;
}
