import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';

function text(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }] };
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2));
}

function err(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }], isError: true as const };
}

export function registerTools(server: McpServer, api: ApiClient) {

  // ── mcp_login ──────────────────────────────────────────────────────
  server.registerTool(
    'mcp_login',
    {
      title: 'Login',
      description: 'Authenticate with the test automation backend. Must be called before any other tool if API_TOKEN is not set.',
      inputSchema: {
        username: z.string().describe('Login username'),
        password: z.string().describe('Login password'),
      },
    },
    async ({ username, password }) => {
      try {
        const result = await api.login(username, password);
        return text(`Logged in as ${result.user.username}. Token stored for this session.`);
      } catch (e: unknown) {
        return err(`Login failed: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_list ──────────────────────────────────────────────────
  server.registerTool(
    'manifest_list',
    {
      title: 'List Test Manifests',
      description: 'List all test manifests. Optionally filter by suite or tag.',
      inputSchema: {
        suite: z.string().optional().describe('Filter by suite (smoke, regression, e2e, grpc-smoke)'),
        tag: z.string().optional().describe('Filter by tag'),
      },
    },
    async ({ suite, tag }) => {
      try {
        const tests = await api.listTests(suite, tag);
        const summary = tests.map(t => ({
          id: t.id,
          name: t.name,
          suite: t.suite,
          tags: t.tags,
          type: t.type,
          steps: t.steps,
        }));
        return json(summary);
      } catch (e: unknown) {
        return err(`Failed to list tests: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_get ───────────────────────────────────────────────────
  server.registerTool(
    'manifest_get',
    {
      title: 'Get Test Manifest',
      description: 'Get a specific test manifest by ID. Returns the full manifest YAML structure and stats.',
      inputSchema: {
        id: z.string().describe('Test manifest ID (e.g. "balance-get-assets")'),
      },
    },
    async ({ id }) => {
      try {
        const detail = await api.getTest(id);
        return json(detail);
      } catch (e: unknown) {
        return err(`Failed to get test: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_generate ──────────────────────────────────────────────
  server.registerTool(
    'manifest_generate',
    {
      title: 'Generate Test Manifest',
      description: 'Generate a new YAML test manifest from a natural language prompt using AI. The prompt should describe what the test should do.',
      inputSchema: {
        prompt: z.string().describe('Natural language description of the test to generate'),
        model: z.string().optional().describe('AI model to use (e.g. "gpt-4o", "claude-sonnet-4-20250514")'),
      },
    },
    async ({ prompt, model }) => {
      try {
        const status = await api.aiStatus();
        if (!status.configured) {
          return err('AI is not configured on the backend. Set AI_API_KEY and AI_PROVIDER env vars.');
        }
        const result = await api.aiGenerate(prompt, [], model);
        const output: Record<string, unknown> = { yaml: result.yaml };
        if (result.has_errors) {
          output.validation_errors = result.validation_errors;
        }
        return json(output);
      } catch (e: unknown) {
        return err(`Generation failed: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_refine ────────────────────────────────────────────────
  server.registerTool(
    'manifest_refine',
    {
      title: 'Refine Test Manifest',
      description: 'Refine an existing YAML test manifest with natural language instructions using AI.',
      inputSchema: {
        yaml: z.string().describe('Current YAML manifest content'),
        prompt: z.string().describe('Instructions for how to modify the manifest'),
        model: z.string().optional().describe('AI model to use'),
      },
    },
    async ({ yaml, prompt, model }) => {
      try {
        const result = await api.aiRefine(yaml, prompt, [], model);
        const output: Record<string, unknown> = { yaml: result.yaml };
        if (result.has_errors) {
          output.validation_errors = result.validation_errors;
        }
        return json(output);
      } catch (e: unknown) {
        return err(`Refinement failed: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_validate ──────────────────────────────────────────────
  server.registerTool(
    'manifest_validate',
    {
      title: 'Validate Test Manifest',
      description: 'Validate a test manifest (JSON object) against the schema without saving it.',
      inputSchema: {
        manifest: z.record(z.unknown()).describe('Test manifest as a JSON object (with id, name, steps, etc.)'),
      },
    },
    async ({ manifest }) => {
      try {
        const result = await api.validate(manifest);
        return json(result);
      } catch (e: unknown) {
        return err(`Validation failed: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_save ──────────────────────────────────────────────────
  server.registerTool(
    'manifest_save',
    {
      title: 'Save Test Manifest',
      description: 'Save a test manifest (JSON object) to the database. The manifest must have an id field.',
      inputSchema: {
        manifest: z.record(z.unknown()).describe('Test manifest as a JSON object'),
      },
    },
    async ({ manifest }) => {
      try {
        const result = await api.saveTest(manifest);
        return text(`Saved manifest with id: ${result.id}`);
      } catch (e: unknown) {
        return err(`Save failed: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_save_yaml ─────────────────────────────────────────────
  server.registerTool(
    'manifest_save_yaml',
    {
      title: 'Save YAML Manifest',
      description: 'Save a raw YAML string as a test manifest. The YAML is parsed and stored in the database.',
      inputSchema: {
        yaml: z.string().describe('YAML manifest content'),
      },
    },
    async ({ yaml }) => {
      try {
        const result = await api.aiSave(yaml);
        return text(`Saved manifest with id: ${result.id}`);
      } catch (e: unknown) {
        return err(`Save failed: ${(e as Error).message}`);
      }
    },
  );

  // ── manifest_delete ────────────────────────────────────────────────
  server.registerTool(
    'manifest_delete',
    {
      title: 'Delete Test Manifest',
      description: 'Delete a test manifest by ID.',
      inputSchema: {
        id: z.string().describe('Test manifest ID to delete'),
      },
    },
    async ({ id }) => {
      try {
        await api.deleteTest(id);
        return text(`Deleted manifest: ${id}`);
      } catch (e: unknown) {
        return err(`Delete failed: ${(e as Error).message}`);
      }
    },
  );

  // ── schema_get ─────────────────────────────────────────────────────
  server.registerTool(
    'schema_get',
    {
      title: 'Get Manifest Schema',
      description: 'Get the JSON Schema that defines the valid structure of test manifests.',
      inputSchema: {},
    },
    async () => {
      try {
        const schema = await api.getSchema();
        return json(schema);
      } catch (e: unknown) {
        return err(`Schema fetch failed: ${(e as Error).message}`);
      }
    },
  );

  // ── test_run ───────────────────────────────────────────────────────
  server.registerTool(
    'test_run',
    {
      title: 'Run Test',
      description: 'Execute a test by its manifest ID. Returns the created run object with a run ID you can use to check status.',
      inputSchema: {
        test_id: z.string().describe('Test manifest ID to run'),
        mode: z.string().optional().describe('Execution mode: "mock" (default) or "real"'),
      },
    },
    async ({ test_id, mode }) => {
      try {
        const run = await api.createRun(test_id, mode);
        return json(run);
      } catch (e: unknown) {
        return err(`Run failed: ${(e as Error).message}`);
      }
    },
  );

  // ── run_status ─────────────────────────────────────────────────────
  server.registerTool(
    'run_status',
    {
      title: 'Get Run Status',
      description: 'Get the status and details of a test run by run ID.',
      inputSchema: {
        id: z.string().describe('Run ID'),
      },
    },
    async ({ id }) => {
      try {
        const detail = await api.getRun(id);
        return json(detail);
      } catch (e: unknown) {
        return err(`Failed to get run: ${(e as Error).message}`);
      }
    },
  );

  // ── run_list ───────────────────────────────────────────────────────
  server.registerTool(
    'run_list',
    {
      title: 'List Runs',
      description: 'List recent test runs. Optionally filter by test_id or status.',
      inputSchema: {
        test_id: z.string().optional().describe('Filter by test manifest ID'),
        status: z.string().optional().describe('Filter by status (passed, failed, error, running, pending)'),
        limit: z.number().optional().describe('Max results (default 20)'),
      },
    },
    async ({ test_id, status, limit }) => {
      try {
        const result = await api.listRuns({
          testId: test_id,
          status,
          limit: limit ?? 20,
        });
        return json(result);
      } catch (e: unknown) {
        return err(`Failed to list runs: ${(e as Error).message}`);
      }
    },
  );
}
