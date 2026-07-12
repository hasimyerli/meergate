import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve a dot-path i18n key (e.g. "confidence.blockerFailing") against the
 * translations object and interpolate `{var}` placeholders. Used when a key is
 * carried as data (confidence blockers, release-gate checks) rather than a
 * literal `t.ns.key` access. Falls back to the raw path if unresolved.
 */
export function tkey(obj: unknown, path: string, vars?: Record<string, string | number>): string {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  let out = typeof cur === 'string' ? cur : path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDate(dateStr: string | null | undefined, locale?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString(locale ?? 'en-US');
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'passed':
      return 'bg-emerald-100 text-emerald-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'error':
      return 'bg-orange-100 text-orange-800';
    case 'running':
      return 'bg-blue-100 text-blue-800';
    case 'pending':
      return 'bg-slate-100 text-slate-600';
    case 'skipped':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export function exportCSV(headers: string[], rows: string[][], filename: string): void {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
