import type { GateSummary, CoverageReport } from '@/lib/api';

export type GateStatus = GateSummary['status'];

/** Tailwind tokens per service gate status (matches the app palette). */
export function gateStatusColor(s: GateStatus): { text: string; bg: string; ring: string; border: string; dot: string } {
  switch (s) {
    case 'ready':
      return { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', border: 'border-emerald-200', dot: 'bg-emerald-500' };
    case 'watch':
      return { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', border: 'border-amber-200', dot: 'bg-amber-500' };
    case 'blocked':
      return { text: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200', border: 'border-red-200', dot: 'bg-red-500' };
    case 'evaluating':
      return { text: 'text-blue-700', bg: 'bg-blue-50', ring: 'ring-blue-200', border: 'border-blue-200', dot: 'bg-blue-500' };
    default: // no_baseline | not_configured
      return { text: 'text-slate-500', bg: 'bg-slate-50', ring: 'ring-slate-200', border: 'border-slate-200', dot: 'bg-slate-400' };
  }
}

/** i18n key for a service gate status label. */
export const GATE_STATUS_LABEL: Record<GateStatus, string> = {
  ready: 'releaseGates.svcReady',
  watch: 'releaseGates.svcWatch',
  blocked: 'releaseGates.svcBlocked',
  no_baseline: 'releaseGates.svcNoBaseline',
  not_configured: 'releaseGates.svcNotConfigured',
  evaluating: 'releaseGates.svcEvaluating',
};

/** Coverage percent for one service id, or null when unavailable. */
export function serviceCoveragePct(coverage: CoverageReport | null, serviceId: string): number | null {
  if (!coverage) return null;
  const svc = coverage.services.find((s) => s.id === serviceId);
  if (!svc || svc.total === 0) return null;
  return Math.round((svc.covered / svc.total) * 100);
}

/** Whether any test covers an operation of this service (i.e. the gate has tests). */
export function coverageHasTests(coverage: CoverageReport | null, serviceId: string): boolean {
  if (!coverage) return false;
  const svc = coverage.services.find((s) => s.id === serviceId);
  return !!svc && (svc.operations ?? []).some((o) => (o.test_ids ?? []).length > 0);
}

/** Map of test id → the first service id whose operation it covers (real link). */
export function testServiceMap(coverage: CoverageReport | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!coverage) return m;
  for (const svc of coverage.services) {
    for (const op of svc.operations ?? []) {
      for (const tid of op.test_ids ?? []) {
        if (!m.has(tid)) m.set(tid, svc.id);
      }
    }
  }
  return m;
}
