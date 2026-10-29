import { z } from 'zod';
import {
  configureConnectionSchema,
  connectionActionSchema,
  type ConnectionControl,
} from './contracts';
import { mcpResult as result, type McpExtension } from '../../transports/mcp-extension';

/** Adds Anelf channel tools to an authenticated MCP server. */
export const anelfMcp =
  (connection: ConnectionControl): McpExtension =>
  (server) => {
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
        inputSchema: configureConnectionSchema.omit({ skillName: true }),
      },
      async (input, extra) => result(await connection.configure(input, extra.signal)),
    );
    server.registerTool(
      'pet_connection_control',
      {
        description:
          'Connect the saved Anelf channel, disconnect its event stream, or request the current conversation to stop. Disconnecting does not stop the remote agent; use stop first when needed. A stop request may still be settling: inspect busy in pet_connection_state. Connecting and history synchronization support SDK cancellation. Initial attempts return online/error; only previously established connections automatically reconnect.',
        inputSchema: z.object({ action: connectionActionSchema }),
      },
      async ({ action }, extra) => result(await connection.control(action, extra.signal)),
    );
  };
