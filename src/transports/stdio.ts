import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { productName, version } from '../shared/product';

/** A stdio gateway attaches to the running desktop instance without starting a second pet. */
const url = process.env.EMBODIED_URL;
const token = process.env.EMBODIED_TOKEN;
if (!url || !token)
  throw new Error('Set EMBODIED_URL and EMBODIED_TOKEN from the client connection settings');
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname))
  throw new Error('The stdio gateway only connects to the local client');
const client = new Client({ name: 'embodied-stdio-gateway', title: productName, version });
await client.connect(
  new StreamableHTTPClientTransport(new URL('/mcp', parsed), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
const server = new Server(
  { name: 'desktop-embodied', title: productName, version },
  { capabilities: { tools: {} }, instructions: client.getInstructions() },
);
server.setRequestHandler(ListToolsRequestSchema, () => client.listTools());
server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
  client.callTool(request.params, undefined, { signal: extra.signal, timeout: 300000 }),
);
server.onclose = () => {
  void client.close();
};
await server.connect(new StdioServerTransport());
