import type {
  ApiResponse,
  LoginResult,
  TestItem,
  TestDetail,
  RunDetail,
  GenerateResult,
  ValidateResult,
  SaveResult,
} from './types.js';

export class ApiClient {
  private baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token ?? null;
  }

  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== ''),
      );
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });

    const json = (await resp.json()) as ApiResponse<T>;

    if (!json.success) {
      throw new Error(json.error ?? `API error ${resp.status}`);
    }
    return json.data as T;
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const result = await this.request<LoginResult>('POST', '/api/auth/login', {
      username,
      password,
    });
    this.token = result.token;
    return result;
  }

  async listTests(
    suite?: string,
    tag?: string,
  ): Promise<TestItem[]> {
    const query: Record<string, string> = {};
    if (suite) query.suite = suite;
    if (tag) query.tag = tag;
    return this.request<TestItem[]>('GET', '/api/tests', undefined, query);
  }

  async getTest(id: string): Promise<TestDetail> {
    return this.request<TestDetail>('GET', `/api/tests/${encodeURIComponent(id)}`);
  }

  async deleteTest(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(
      'DELETE',
      `/api/tests/${encodeURIComponent(id)}`,
    );
  }

  async saveTest(manifest: Record<string, unknown>): Promise<SaveResult> {
    return this.request<SaveResult>('POST', '/api/tests', manifest);
  }

  async createRun(
    testId: string,
    mode?: string,
    overrides?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('POST', '/api/runs', {
      test_id: testId,
      mode: mode ?? 'mock',
      overrides: overrides ?? {},
    });
  }

  async getRun(id: string): Promise<RunDetail> {
    return this.request<RunDetail>('GET', `/api/runs/${encodeURIComponent(id)}`);
  }

  async listRuns(opts?: {
    testId?: string;
    status?: string;
    limit?: number;
  }): Promise<{ runs: Record<string, unknown>[]; total: number }> {
    const query: Record<string, string> = {};
    if (opts?.testId) query.test_id = opts.testId;
    if (opts?.status) query.status = opts.status;
    if (opts?.limit) query.limit = String(opts.limit);
    return this.request<{ runs: Record<string, unknown>[]; total: number }>(
      'GET',
      '/api/runs',
      undefined,
      query,
    );
  }

  async aiGenerate(
    prompt: string,
    history?: { role: string; content: string }[],
    model?: string,
  ): Promise<GenerateResult> {
    return this.request<GenerateResult>('POST', '/api/ai/generate', {
      prompt,
      history: history ?? [],
      model: model ?? '',
    });
  }

  async aiRefine(
    yaml: string,
    prompt: string,
    history?: { role: string; content: string }[],
    model?: string,
  ): Promise<GenerateResult> {
    return this.request<GenerateResult>('POST', '/api/ai/refine', {
      yaml,
      prompt,
      history: history ?? [],
      model: model ?? '',
    });
  }

  async aiSave(yaml: string): Promise<SaveResult> {
    return this.request<SaveResult>('POST', '/api/ai/save', { yaml });
  }

  async validate(
    manifest: Record<string, unknown>,
  ): Promise<ValidateResult> {
    return this.request<ValidateResult>(
      'POST',
      '/api/builder/validate',
      manifest,
    );
  }

  async getSchema(): Promise<unknown> {
    const url = `${this.baseUrl}/api/schema`;
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Schema fetch failed: ${resp.status}`);
    return resp.json();
  }

  async aiStatus(): Promise<{ configured: boolean }> {
    return this.request<{ configured: boolean }>('GET', '/api/ai/status');
  }
}
