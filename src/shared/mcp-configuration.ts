import { productName } from './product';

export interface LocalControlConnection {
  url: string;
  token: string;
}

/** Describes the running instance for a Streamable HTTP MCP client. */
export function mcpConfiguration({ url, token }: LocalControlConnection) {
  return {
    mcpServers: {
      [productName]: {
        type: 'http',
        url: new URL('/mcp', url).href,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  };
}
