const API_BASE = '/api';
const API_DIRECT = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : 'http://localhost:3001/api';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeader(),
    ...init?.headers as Record<string, string>,
  };
  if (init?.body) {
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out (120s). AI model may be slow — try again.');
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fetchJSON] Network error for ${url}:`, msg);
    throw new Error(`Network error: ${msg}. Is the API server running?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.error || `HTTP ${res.status}`;
    console.error(`[fetchJSON] HTTP ${res.status} from ${url}:`, body);
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    throw new Error(detail);
  }
  return res.json();
}

// ---------- Types ----------

export interface TestItem {
  id: string;
  name: string;
  suite: string;
  tags: string[];
  version: number;
  params: Record<string, string>;
  lastRunStatus?: string;
  lastRunAt?: string;
  passRate?: number;
  flakeScore?: number;
  owner?: string;
}

export interface RunContext {
  label?: string;
  trigger?: 'manual' | 'scheduled' | 'ci' | 'webhook';
  triggered_by?: string;
  git_ref?: string;
  git_commit?: string;
  environment?: string;
  jira_ref?: string;
  run_tags?: string[];
}

export interface RunItem {
  id: string;
  test_id: string;
  suite_id: string | null;
  session_id: string | null;
  status: string;
  mode: string;
  label: string | null;
  trigger: string;
  triggered_by: string | null;
  git_ref: string | null;
  git_commit: string | null;
  environment: string | null;
  jira_ref: string | null;
  run_tags: string[] | null;
  duration_ms: number | null;
  error: string | null;
  correlation_id: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface StepResultItem {
  id: string;
  run_id: string;
  step_index: number;
  step_name: string;
  step_type: string;
  status: string;
  request_summary: Record<string, unknown> | null;
  response_summary: Record<string, unknown> | null;
  assertions: Array<{ name: string; passed: boolean; expected: unknown; actual: unknown }> | null;
  duration_ms: number | null;
  error: string | null;
  retry_count: number;
}

export interface ArtifactItem {
  id: string;
  type: string;
  key: string;
  value: string;
}

export interface ManifestStep {
  name: string;
  type: string;
  dependsOn?: string[];
  [key: string]: unknown;
}

export interface RunManifest {
  id: string;
  name: string;
  steps: ManifestStep[];
  [key: string]: unknown;
}

export interface RunDetail extends RunItem {
  steps: StepResultItem[];
  artifacts: ArtifactItem[];
  manifest?: RunManifest | null;
}

export interface SessionItem {
  id: string;
  label: string;
  environment: string | null;
  git_ref: string | null;
  git_commit: string | null;
  jira_ref: string | null;
  created_by: string | null;
  run_tags: string[] | null;
  created_at: string;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    running: number;
    pending: number;
    duration_ms: number;
  };
}

export interface SessionDetail extends SessionItem {
  runs: RunItem[];
}

export interface TestStats {
  totalRuns: number;
  passed: number;
  failed: number;
  error: number;
  passRate: number;
  flakeScore: number;
  avgDurationMs: number;
  last10Statuses: string[];
}

export interface EnvironmentItem {
  name: string;
  description?: string;
  baseUrl: string;
  wsUrl?: string;
  grpcTarget?: string;
  grpcInsecure?: boolean;
}

export interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  type: string;
}

export interface GrpcServiceItem {
  fqn: string;
  target: string;
  tls: boolean;
}

// ---------- Tests ----------

export async function fetchTests(params?: { suite?: string; tag?: string }): Promise<TestItem[]> {
  const query = new URLSearchParams();
  if (params?.suite) query.set('suite', params.suite);
  if (params?.tag) query.set('tag', params.tag);
  const qs = query.toString();
  const res = await fetchJSON<{ data: TestItem[] }>(`${API_BASE}/tests${qs ? `?${qs}` : ''}`);
  return res.data;
}

export async function deleteTestApi(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/tests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function runSingleTest(
  testId: string,
  mode?: string,
  overrides?: Record<string, string>,
  context?: RunContext,
  sessionId?: string,
  runId?: string,
) {
  return fetchJSON(`${API_BASE}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      test_id: testId,
      mode,
      overrides,
      context: context && Object.values(context).some((v) => v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0)) ? context : undefined,
      session_id: sessionId,
      run_id: runId,
    }),
  });
}

export async function runBatch(opts: {
  suite?: string;
  tags?: string[];
  mode?: string;
  context?: RunContext;
  sessionId?: string;
}) {
  return fetchJSON(`${API_BASE}/runs/batch`, {
    method: 'POST',
    body: JSON.stringify({
      suite: opts.suite,
      tags: opts.tags,
      mode: opts.mode,
      context: opts.context,
      session_id: opts.sessionId,
    }),
  });
}

export async function fetchRuns(params?: {
  status?: string;
  test_id?: string;
  session_id?: string;
  environment?: string;
  trigger?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ runs: RunItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.test_id) query.set('test_id', params.test_id);
  if (params?.session_id) query.set('session_id', params.session_id);
  if (params?.environment) query.set('environment', params.environment);
  if (params?.trigger) query.set('trigger', params.trigger);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  const res = await fetchJSON<{ data: { runs: RunItem[]; total: number } }>(
    `${API_BASE}/runs${qs ? `?${qs}` : ''}`,
  );
  return res.data;
}

export async function deleteRunApi(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/runs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchRunDetail(id: string): Promise<RunDetail> {
  const res = await fetchJSON<{ data: { run: RunItem; steps: StepResultItem[]; artifacts: ArtifactItem[]; manifest?: RunManifest | null } }>(`${API_BASE}/runs/${encodeURIComponent(id)}`);
  const d = res.data;
  return {
    ...d.run,
    steps: d.steps ?? [],
    artifacts: d.artifacts ?? [],
    manifest: d.manifest ?? null,
  };
}

export async function resumeRun(
  runId: string,
  fromStep: number,
  overrides?: Record<string, string>,
): Promise<{ run_id: string }> {
  const res = await fetchJSON<{ data: RunItem }>(`${API_BASE}/runs/${encodeURIComponent(runId)}/resume`, {
    method: 'POST',
    body: JSON.stringify({ from_step: fromStep, overrides }),
  });
  return { run_id: res.data.id };
}

export async function fetchTestManifest(id: string): Promise<Record<string, unknown>> {
  const res = await fetchJSON<{ data: { manifest: Record<string, unknown>; stats: unknown } }>(`${API_BASE}/tests/${encodeURIComponent(id)}`);
  return res.data.manifest ?? res.data;
}

export async function reloadTests() {
  return fetchJSON(`${API_BASE}/tests/reload`, { method: 'POST' });
}

// ---------- Schedules ----------

export interface ScheduleItem {
  id: string;
  name: string;
  cron: string;
  suite: string | null;
  tags: string[];
  test_ids: string[];
  mode: string;
  enabled: boolean;
  notify_url: string | null;
  rerun_on_fail: boolean;
  max_reruns: number;
  session_id: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

function normalizeSchedule(raw: Record<string, unknown>): ScheduleItem {
  const parseJsonArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  };
  return {
    ...raw,
    test_ids: parseJsonArray(raw.test_ids),
    tags: parseJsonArray(raw.tags),
    enabled: raw.enabled === true || raw.enabled === 1 || raw.enabled === '1',
    rerun_on_fail: raw.rerun_on_fail === true || raw.rerun_on_fail === 1 || raw.rerun_on_fail === '1',
  } as ScheduleItem;
}

export async function fetchSchedules(): Promise<ScheduleItem[]> {
  const res = await fetchJSON<{ data: Record<string, unknown>[] }>(`${API_BASE}/schedules`);
  return (res.data ?? []).map(normalizeSchedule);
}

export async function createScheduleApi(data: {
  name: string;
  cron: string;
  suite?: string;
  tags?: string[];
  test_ids?: string[];
  mode?: string;
  enabled?: boolean;
  notify_url?: string;
  rerun_on_fail?: boolean;
  max_reruns?: number;
  session_id?: string;
}): Promise<ScheduleItem> {
  const res = await fetchJSON<{ data: Record<string, unknown> }>(`${API_BASE}/schedules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return normalizeSchedule(res.data);
}

export async function updateScheduleApi(
  id: string,
  data: Partial<{
    name: string;
    cron: string;
    suite: string;
    tags: string[];
    test_ids: string[];
    mode: string;
    enabled: boolean;
    notify_url: string;
    rerun_on_fail: boolean;
    max_reruns: number;
    session_id: string | null;
  }>,
): Promise<Record<string, unknown>> {
  const res = await fetchJSON<{ data: Record<string, unknown> }>(`${API_BASE}/schedules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function deleteScheduleApi(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function triggerScheduleApi(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/schedules/${encodeURIComponent(id)}/trigger`, { method: 'POST' });
}

// ---------- Alerts ----------

export type AlertScope = 'all' | 'test' | 'session' | 'environment';
export type AlertCondition = 'run_failed' | 'pass_rate_below' | 'avg_duration_above' | 'consecutive_failures' | 'schema_drift';

export interface AlertRuleItem {
  id: string;
  name: string;
  enabled: boolean;
  scope_type: AlertScope;
  scope_value: string | null;
  condition: AlertCondition;
  threshold: number | null;
  window_n: number;
  created_at: string;
}

export interface AlertEventItem {
  id: string;
  rule_id: string;
  rule_name: string;
  run_id: string | null;
  test_id: string;
  message: string;
  severity: 'warning' | 'critical';
  acknowledged: boolean;
  created_at: string;
}

function normalizeAlertRule(raw: Record<string, unknown>): AlertRuleItem {
  return {
    ...raw,
    enabled: raw.enabled === true || raw.enabled === 1 || raw.enabled === '1',
  } as AlertRuleItem;
}

function normalizeAlertEvent(raw: Record<string, unknown>): AlertEventItem {
  return {
    ...raw,
    acknowledged: raw.acknowledged === true || raw.acknowledged === 1 || raw.acknowledged === '1',
  } as AlertEventItem;
}

export async function fetchAlertRules(): Promise<AlertRuleItem[]> {
  const res = await fetchJSON<{ data: Record<string, unknown>[] }>(`${API_BASE}/alerts`);
  return (res.data ?? []).map(normalizeAlertRule);
}

export interface AlertRuleForm {
  name: string;
  scope_type: AlertScope;
  scope_value?: string | null;
  condition: AlertCondition;
  threshold?: number | null;
  window_n?: number;
  enabled?: boolean;
}

export async function createAlertRuleApi(data: AlertRuleForm): Promise<AlertRuleItem> {
  const res = await fetchJSON<{ data: Record<string, unknown> }>(`${API_BASE}/alerts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return normalizeAlertRule(res.data);
}

export async function updateAlertRuleApi(id: string, data: Partial<AlertRuleForm>): Promise<void> {
  await fetchJSON(`${API_BASE}/alerts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAlertRuleApi(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAlertEvents(params?: { acknowledged?: 0 | 1; limit?: number }): Promise<{ events: AlertEventItem[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.acknowledged != null) qs.set('acknowledged', String(params.acknowledged));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetchJSON<{ data: { events: Record<string, unknown>[]; total: number } }>(`${API_BASE}/alert-events${suffix}`);
  return {
    events: (res.data?.events ?? []).map(normalizeAlertEvent),
    total: res.data?.total ?? 0,
  };
}

export async function ackAlertEventApi(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/alert-events/${encodeURIComponent(id)}/ack`, { method: 'POST' });
}

// ---------- Sessions ----------

export async function fetchSessions(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ sessions: SessionItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  const res = await fetchJSON<{ data: { sessions: SessionItem[]; total: number } }>(
    `${API_BASE}/sessions${qs ? `?${qs}` : ''}`,
  );
  return res.data;
}

export async function fetchSessionDetail(id: string): Promise<SessionDetail> {
  const res = await fetchJSON<{ data: { session: SessionItem; runs: RunItem[] } }>(`${API_BASE}/sessions/${encodeURIComponent(id)}`);
  const d = res.data;
  return {
    ...d.session,
    runs: d.runs ?? [],
  };
}

export async function createSessionApi(data: {
  label: string;
  environment?: string;
  git_ref?: string;
  git_commit?: string;
  jira_ref?: string;
  created_by?: string;
  run_tags?: string[];
}): Promise<SessionItem> {
  const res = await fetchJSON<{ data: SessionItem }>(`${API_BASE}/sessions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function updateSessionApi(
  id: string,
  data: Partial<{
    label: string;
    environment: string;
    git_ref: string;
    git_commit: string;
    jira_ref: string;
    created_by: string;
    run_tags: string[];
  }>,
): Promise<SessionItem> {
  const res = await fetchJSON<{ data: SessionItem }>(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function deleteSessionApi(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------- Test Stats ----------

export async function fetchTestStats(testId: string): Promise<TestStats> {
  const res = await fetchJSON<{ data: TestStats }>(`${API_BASE}/tests/${encodeURIComponent(testId)}/stats`);
  return res.data;
}

// ---------- Templates ----------

export async function fetchTemplates(): Promise<TemplateItem[]> {
  const res = await fetchJSON<{ data: TemplateItem[] }>(`${API_BASE}/templates`);
  return res.data;
}

// ---------- Environments ----------

export async function fetchEnvironments(): Promise<EnvironmentItem[]> {
  const res = await fetchJSON<{ data: EnvironmentItem[] }>(`${API_BASE}/environments`);
  return res.data;
}

// ---------- gRPC Services ----------

export async function fetchGrpcServices(): Promise<GrpcServiceItem[]> {
  const res = await fetchJSON<{ data: GrpcServiceItem[] }>(`${API_BASE}/grpc/services`);
  return res.data;
}

// ---------- gRPC Introspect ----------

export interface ProtoField {
  name: string;
  type: string;
  repeated: boolean;
  messageFields?: ProtoField[];
}

export interface ProtoMethodInfo {
  name: string;
  protoFile?: string;
  usedIn?: number;
  requestType?: string;
  responseType?: string;
  requestFields?: ProtoField[];
  responseFields?: ProtoField[];
}

export interface ProtoServiceInfo {
  fqn: string;
  domain?: string;
  protoFile?: string;
  target?: string;
  methods: ProtoMethodInfo[];
}

export async function fetchGrpcIntrospect(): Promise<ProtoServiceInfo[]> {
  const res = await fetchJSON<{ data: ProtoServiceInfo[] }>(`${API_BASE}/grpc/introspect`);
  return res.data;
}

// ---------- Run Notes ----------

export interface RunNote {
  id: string;
  run_id: string;
  author: string;
  text: string;
  created_at: string;
}

export async function fetchRunNotes(runId: string): Promise<RunNote[]> {
  const res = await fetchJSON<{ data: RunNote[] }>(`${API_BASE}/runs/${encodeURIComponent(runId)}/notes`);
  return res.data ?? [];
}

export async function createRunNote(runId: string, text: string): Promise<RunNote> {
  const res = await fetchJSON<{ data: RunNote }>(`${API_BASE}/runs/${encodeURIComponent(runId)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return res.data;
}

export async function deleteRunNote(runId: string, noteId: string): Promise<void> {
  await fetchJSON(`${API_BASE}/runs/${encodeURIComponent(runId)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
}

// ---------- Builder ----------

export async function validateManifest(manifest: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return fetchJSON(`${API_BASE}/builder/validate`, {
    method: 'POST',
    body: JSON.stringify(manifest),
  });
}

export async function saveManifest(manifest: unknown, filename?: string): Promise<{ id: string; file: string }> {
  const res = await fetchJSON<{ data: { id: string; file: string } }>(`${API_BASE}/builder/save`, {
    method: 'POST',
    body: JSON.stringify({ manifest, filename }),
  });
  return res.data;
}

export async function exportYaml(manifest: unknown): Promise<string> {
  const res = await fetchJSON<{ data: { yaml: string } }>(`${API_BASE}/builder/export-yaml`, {
    method: 'POST',
    body: JSON.stringify(manifest),
  });
  return res.data.yaml;
}

// ---------- AI ----------

export interface AIGenerateResponse {
  yaml: string;
  manifest: unknown;
  validationErrors?: string[];
  hasErrors: boolean;
}

export interface AIStatusResponse {
  configured: boolean;
  provider?: string;
  model: string;
  apiUrl: string;
}

export async function fetchAIStatus(): Promise<AIStatusResponse> {
  const res = await fetchJSON<{ data: AIStatusResponse }>(`${API_DIRECT}/ai/status`);
  return res.data;
}

// linkAbort wires an optional caller-provided signal to abort `controller`,
// returning a cleanup fn. Lets the UI cancel an in-flight AI request while the
// built-in timeout still applies.
function linkAbort(controller: AbortController, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

export async function aiGenerate(prompt: string, history?: Array<{ role: string; content: string }>, model?: string, signal?: AbortSignal): Promise<AIGenerateResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const unlink = linkAbort(controller, signal);
  try {
    const res = await fetchJSON<{ data: AIGenerateResponse }>(`${API_DIRECT}/ai/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt, history, model }),
      signal: controller.signal,
    });
    return res.data;
  } finally {
    clearTimeout(timeout);
    unlink();
  }
}

export async function aiSave(yaml: string): Promise<{ filename: string; path: string }> {
  const res = await fetchJSON<{ data: { filename: string; path: string } }>(`${API_DIRECT}/ai/save`, {
    method: 'POST',
    body: JSON.stringify({ yaml }),
  });
  return res.data;
}

export async function aiDebugRun(runId: string, signal?: AbortSignal): Promise<AIGenerateResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const unlink = linkAbort(controller, signal);
  try {
    const res = await fetchJSON<{ data: AIGenerateResponse }>(`${API_DIRECT}/ai/debug`, {
      method: 'POST',
      body: JSON.stringify({ run_id: runId }),
      signal: controller.signal,
    });
    return res.data;
  } finally {
    clearTimeout(timeout);
    unlink();
  }
}

export async function aiRefine(yaml: string, prompt: string, history?: Array<{ role: string; content: string }>, model?: string, signal?: AbortSignal): Promise<AIGenerateResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const unlink = linkAbort(controller, signal);
  try {
    const res = await fetchJSON<{ data: AIGenerateResponse }>(`${API_DIRECT}/ai/refine`, {
      method: 'POST',
      body: JSON.stringify({ yaml, prompt, history, model }),
      signal: controller.signal,
    });
    return res.data;
  } finally {
    clearTimeout(timeout);
    unlink();
  }
}

// ---------- Service Catalog ----------

export interface CatalogEntry {
  id: string;
  protocol: 'grpc' | 'rest';
  name: string;
  target: string;
  domain: string;
  config: Record<string, unknown>;
  catalog?: Record<string, unknown> | null;
  synced_at?: string | null;
  sync_error?: string | null;
  created_at: string;
  health_status?: 'healthy' | 'unreachable' | 'unknown' | null;
  latency_ms?: number | null;
  last_health_at?: string | null;
  drift_summary?: string | null;
}

export interface SyncReport {
  total: number;
  synced: number;
  failed: number;
  errors?: Array<{ id: string; error: string }>;
}

export async function fetchCatalog(protocol?: string): Promise<CatalogEntry[]> {
  const qs = protocol ? `?protocol=${protocol}` : '';
  const res = await fetchJSON<{ data: CatalogEntry[] }>(`${API_BASE}/catalog${qs}`);
  return res.data ?? [];
}

export async function syncAllCatalog(): Promise<SyncReport> {
  const res = await fetchJSON<{ data: SyncReport }>(`${API_BASE}/catalog/sync`, { method: 'POST' });
  return res.data;
}

export async function syncOneCatalog(id: string): Promise<void> {
  await fetchJSON(`${API_BASE}/catalog/sync/${encodeURIComponent(id)}`, { method: 'POST' });
}

export async function addCatalogTarget(entry: Partial<CatalogEntry>): Promise<CatalogEntry> {
  const res = await fetchJSON<{ data: CatalogEntry }>(`${API_BASE}/catalog/targets`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
  return res.data;
}

export async function deleteCatalogTarget(id: string): Promise<void> {
  // Pass id as a query param (not a path segment) so ids containing ':' or '/'
  // survive the dev proxy / URL routing intact.
  await fetchJSON(`${API_BASE}/catalog/targets?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function discoverCatalogTarget(target: string, tls: boolean, services?: string[]): Promise<{ discovered: number; entries: CatalogEntry[] }> {
  const res = await fetchJSON<{ data: { discovered: number; entries: CatalogEntry[] } }>(`${API_BASE}/catalog/discover`, {
    method: 'POST',
    body: JSON.stringify({ target, tls, services }),
  });
  return res.data;
}

export interface PreviewResult {
  protocol: 'grpc' | 'rest';
  target: string;
  tls: boolean;
  services?: Array<{ fqn: string; method_count: number }>;
  endpoints?: Array<{ method: string; path: string; summary?: string }>;
}

export async function previewCatalogTarget(protocol: string, target: string, tls: boolean): Promise<PreviewResult> {
  const res = await fetchJSON<{ data: PreviewResult }>(`${API_BASE}/catalog/preview`, {
    method: 'POST',
    body: JSON.stringify({ protocol, target, tls }),
  });
  return res.data;
}

export async function checkCatalogHealth(id?: string): Promise<void> {
  const qs = id ? `?id=${encodeURIComponent(id)}` : '';
  await fetchJSON(`${API_BASE}/catalog/health${qs}`, { method: 'POST' });
}

export interface OperationCoverage { name: string; covered: boolean; test_ids?: string[]; }
export interface ServiceCoverage { id: string; total: number; covered: number; operations: OperationCoverage[]; }
export interface CoverageReport { services: ServiceCoverage[]; total_operations: number; covered_operations: number; }

export async function fetchCoverage(): Promise<CoverageReport> {
  const res = await fetchJSON<{ data: CoverageReport }>(`${API_BASE}/catalog/coverage`);
  return res.data;
}

export interface HealthCheck { status: string; latency_ms: number | null; checked_at: string; }
export interface HealthStats { p50: number | null; p95: number | null; p99: number | null; uptime: number | null; total: number; }
export interface HealthReport { checks: HealthCheck[]; stats: HealthStats | null; }

export async function fetchHealthHistory(id: string): Promise<HealthReport> {
  const res = await fetchJSON<{ data: HealthReport }>(`${API_BASE}/catalog/${encodeURIComponent(id)}/health-history`);
  return res.data;
}

export interface InvokeResult {
  ok: boolean;
  error?: string;
  latency_ms?: number;
  status?: { Code: number; Details: string }; // gRPC
  message?: unknown;                            // gRPC response
  status_code?: number;                         // REST
  body?: unknown;                               // REST response
  headers?: Record<string, string>;
}

export async function invokeCatalogTarget(id: string, req: { method?: string; path?: string; message?: Record<string, unknown>; headers?: Record<string, string> }): Promise<InvokeResult> {
  const res = await fetchJSON<{ data: InvokeResult }>(`${API_BASE}/catalog/${encodeURIComponent(id)}/invoke`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
  return res.data;
}

export async function importCatalog(protocol: string, data: Record<string, unknown>): Promise<{ imported: number }> {
  const res = await fetchJSON<{ data: { imported: number } }>(`${API_BASE}/catalog/import`, {
    method: 'POST',
    body: JSON.stringify({ protocol, data }),
  });
  return res.data;
}

// ---------- Schema ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchManifestSchema(): Promise<any> {
  const res = await fetch(`${API_BASE}/schema`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('Failed to fetch schema');
  return res.json();
}

// ---------- Release Gates (service-based) ----------

export interface TestResultSnapshot { test_id: string; run_id: string; status: string; }

export interface ReleaseCandidate {
  id: string; service_id: string; label: string; target_version: string; environment: string;
  git_ref: string; git_commit: string; pr_ref: string; issue_ref: string; change_summary: string;
  status: string; scope: string[]; results: TestResultSnapshot[]; created_at: string; updated_at: string;
}

export interface ServiceBaseline {
  id: string; service_id: string; candidate_id: string; label: string;
  results: TestResultSnapshot[]; created_at: string;
}

export type RegressionType =
  | 'new_regression' | 'known_failure' | 'fixed' | 'still_passing'
  | 'new_test_failure' | 'new_test_passing' | 'missing';

export interface TestDiff { test_id: string; baseline_status: string; candidate_status: string; type: RegressionType; }

export interface RegressionCounts {
  new_regressions: number; known_failures: number; fixed: number;
  still_passing: number; new_test_failures: number;
}

export interface GateSummary {
  service_id: string;
  status: 'ready' | 'watch' | 'blocked' | 'no_baseline' | 'not_configured' | 'evaluating';
  gate_test_count: number;
  candidate: ReleaseCandidate | null;
  baseline: ServiceBaseline | null;
  diffs: TestDiff[];
  counts: RegressionCounts;
  last_evaluated_at: string | null;
}

export interface CandidateInput {
  label?: string; target_version?: string; environment?: string;
  git_ref?: string; git_commit?: string; pr_ref?: string; issue_ref?: string; change_summary?: string;
}

/** Gate summaries keyed by service id, for services that have a candidate or baseline. */
export async function fetchGates(): Promise<Record<string, GateSummary>> {
  const res = await fetchJSON<{ data: Record<string, GateSummary> }>(`${API_BASE}/release-gates`);
  return res.data ?? {};
}

export async function fetchGate(serviceId: string): Promise<GateSummary> {
  const res = await fetchJSON<{ data: GateSummary }>(`${API_BASE}/release-gates/${encodeURIComponent(serviceId)}`);
  return res.data;
}

export async function createCandidate(serviceId: string, body: CandidateInput): Promise<ReleaseCandidate> {
  const res = await fetchJSON<{ data: ReleaseCandidate }>(
    `${API_BASE}/release-gates/${encodeURIComponent(serviceId)}/candidates`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return res.data;
}

export async function evaluateCandidate(candidateId: string): Promise<ReleaseCandidate> {
  const res = await fetchJSON<{ data: ReleaseCandidate }>(
    `${API_BASE}/release-candidates/${encodeURIComponent(candidateId)}/evaluate`,
    { method: 'POST' },
  );
  return res.data;
}

export async function markBaseline(serviceId: string, candidateId?: string): Promise<ServiceBaseline> {
  const res = await fetchJSON<{ data: ServiceBaseline }>(
    `${API_BASE}/release-gates/${encodeURIComponent(serviceId)}/baseline`,
    { method: 'POST', body: JSON.stringify({ candidate_id: candidateId ?? '' }) },
  );
  return res.data;
}
