import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './api-client.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const API_TOKEN = process.env.API_TOKEN ?? '';
const API_USERNAME = process.env.API_USERNAME ?? '';
const API_PASSWORD = process.env.API_PASSWORD ?? '';

const api = new ApiClient(API_URL, API_TOKEN || undefined);

if (!API_TOKEN && API_USERNAME && API_PASSWORD) {
  try {
    await api.login(API_USERNAME, API_PASSWORD);
  } catch {
    process.stderr.write('[test-automation-mcp] Auto-login failed. Use mcp_login tool manually.\n');
  }
}

const server = new McpServer({
  name: 'test-automation',
  version: '1.0.0',
});

registerTools(server, api);
registerResources(server, api);

const transport = new StdioServerTransport();
await server.connect(transport);
