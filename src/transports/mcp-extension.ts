import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type McpExtension = (server: McpServer) => void;
export const mcpResult = (value: object) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  structuredContent: { ...value },
});
