import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';

export function registerResources(server: McpServer, api: ApiClient) {
  server.registerResource(
    'manifest-schema',
    'test-automation://schema/manifest',
    {
      title: 'Test Manifest JSON Schema',
      description:
        'The JSON Schema defining the valid structure for YAML test manifests. Use this to understand what fields, step types, and assertion types are available.',
      mimeType: 'application/schema+json',
    },
    async (uri) => {
      try {
        const schema = await api.getSchema();
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(schema, null, 2),
              mimeType: 'application/schema+json',
            },
          ],
        };
      } catch {
        return {
          contents: [
            {
              uri: uri.href,
              text: '{"error": "Failed to fetch schema. Is the backend running?"}',
              mimeType: 'application/json',
            },
          ],
        };
      }
    },
  );
}
