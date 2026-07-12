export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LoginResult {
  token: string;
  user: { id: string; username: string };
}

export interface TestItem {
  id: string;
  name: string;
  suite: string;
  tags: string[];
  type: string;
  steps: number;
  owner: string;
  last_run?: RunSummary;
}

export interface RunSummary {
  id: string;
  status: string;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
}

export interface TestDetail {
  manifest: Record<string, unknown>;
  stats: Record<string, unknown>;
}

export interface RunDetail {
  run: Record<string, unknown>;
  steps: Record<string, unknown>[];
  artifacts: Record<string, unknown>[];
  manifest: Record<string, unknown> | null;
}

export interface GenerateResult {
  yaml: string;
  manifest: Record<string, unknown>;
  validation_errors: string[];
  has_errors: boolean;
  raw_response?: string;
}

export interface ValidateResult {
  valid: boolean;
  errors: string[];
}

export interface SaveResult {
  saved: boolean;
  id: string;
}
