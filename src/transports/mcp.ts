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
  const server = new McpServer(
    { name: 'desktop-embodied', title: productName, version },
    {
      instructions:
        'Control the AnelfBodied companion, not the operating system or other applications. ' +
        'Use actions when they help the current task; ordinary conversation does not require animation. ' +
        'Start with pet_capabilities: actions contains common operation schemas; model.actions contains the active skin content. ' +
        'Use perform only with a discovered name, the current model.revision and model.status ready. ' +
        'pet_execute takes a top-level desktop-pet/1 batch with a unique id, a task session, expiresAt computed from current Unix milliseconds, and sequential commands. ' +
        'Allow the client timeout to cover queueing, action durations and any user answer. ' +
        'Read receipts to confirm completion; ask answers are in the corresponding results entry. ' +
        'After an interrupted call, query pet_state with the original id before deciding what to do. Never blindly replay uncertain work. ' +
        'Use pet_cancel for your own batch or task session; do not undo user takeover by automatically moving the pet back.',
    },
  );
  server.registerTool(
    'pet_capabilities',
    {
      description:
        'Discover actions (common operation schemas) and model.actions (active skin content), plus model readiness, revision, bindings and suggested durations. Call again after skin changes or before using a behavior mapping. Use perform with a discovered name and current revision only while model.status is ready. Bindings are mappings, not tools; never assume fixed motion names.',
      annotations: { readOnlyHint: true },
    },
    async () => result(controller.capabilities()),
  );
  server.registerTool(
    'pet_execute',
    {
      description:
        'Execute a top-level batch: protocol desktop-pet/1, unique id, task session, expiresAt in current Unix milliseconds (future, at most five minutes), and 1–16 sequential commands. Do not wrap it in payload or message. Expiry covers queueing and execution. Waits for a terminal receipt; ask returns the real answer in its results entry. Inspect partial results, not just status. After interruption query pet_state first; retries must reuse the entire original batch including expiresAt. Never blindly replay unknown work.',
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
        'Cancel your own batch by id or task by session, wait for execution cleanup, and return partial receipts. Supplying both filters by both. Sessions reject late commands for five minutes after cancellation. An empty receipts array means no active match, not that nothing ever ran; query pet_state for the original id.',
      inputSchema: cancelSchema,
    },
    async (input) => result({ receipts: await controller.cancel(owner, input) }),
  );
  server.registerTool(
    'pet_state',
    {
      description:
        'Read recent receipts or query one command by its original id. Returns receipts only, not a screenshot, live coordinates or channel status. Reading never re-executes work. Use this after a timeout or disconnection; an empty result is not proof of success.',
      inputSchema: z.object({ id: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      result({
        receipts: id ? [controller.get(owner, id)].filter(Boolean) : controller.list(owner),
      }),
  );
  extensions.forEach((register) => register(server));
  return server;
}
