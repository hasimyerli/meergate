export interface DashboardConfig {
  kpis: string[];
  sections: string[];
}

// Home = operational ("now") metrics. Analytical metrics (pass rate, avg
// duration, flaky) live on the Insights page to avoid duplication.
export const ALL_KPIS = [
  { id: 'totalTests', label: 'Total Tests' },
  { id: 'runsToday', label: 'Runs Today' },
  { id: 'runningNow', label: 'Running Now' },
  { id: 'failedToday', label: 'Failed Today' },
  { id: 'activeSchedules', label: 'Active Schedules' },
] as const;

export const ALL_SECTIONS = [
  { id: 'failingTests', label: 'Failing Tests' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'schedules', label: 'Active Schedules' },
] as const;

export const DEFAULT_CONFIG: DashboardConfig = {
  kpis: ['runsToday', 'runningNow', 'failedToday', 'activeSchedules'],
  sections: ['failingTests', 'sessions', 'schedules'],
};

const STORAGE_KEY = 'dashboard-config';

export function loadDashboardConfig(): DashboardConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      kpis: Array.isArray(parsed.kpis) ? parsed.kpis : DEFAULT_CONFIG.kpis,
      sections: Array.isArray(parsed.sections) ? parsed.sections : DEFAULT_CONFIG.sections,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveDashboardConfig(config: DashboardConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
