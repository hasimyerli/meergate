/**
 * Confidence engine — the heart of the "API Release Confidence" story.
 *
 * Pure, null-safe, no React and no fetching. It takes already-fetched data and
 * derives an API Confidence Score, the signals behind it, human blockers, and
 * release-gate checks. Every consumer (Overview, Release Gates, Service Catalog)
 * feeds it the same inputs so the numbers never disagree.
 *
 * Honesty rules: missing data is never faked. An unavailable signal is dropped
 * and the remaining weights are renormalized; if nothing is computable the score
 * is `null` and the status is `unknown`. No division ever yields NaN.
 */

import type {
  TestItem,
  CoverageReport,
  CatalogEntry,
  ScheduleItem,
} from '@/lib/api';

export type ConfidenceStatus = 'ready' | 'watch' | 'risky' | 'blocked' | 'unknown';
export type Severity = 'critical' | 'warning' | 'info';

/** Default coverage threshold (%) below which a release is considered risky. */
export const DEFAULT_COVERAGE_THRESHOLD = 70;
/** Tag that marks a test as release-critical. */
export const DEFAULT_CRITICAL_TAG = 'critical';

export interface ConfidenceInput {
  tests?: TestItem[] | null;
  coverage?: CoverageReport | null;
  catalog?: CatalogEntry[] | null;
  schedules?: ScheduleItem[] | null;
  /** Count of currently open (unacknowledged) critical incidents. */
  openCriticalIncidents?: number | null;
}

export interface ConfidenceOptions {
  coverageThreshold?: number;
  criticalTag?: string;
  policy?: GatePolicy;
}

export type SignalKey = 'coverage' | 'failingTests' | 'serviceHealth' | 'incidents' | 'schedules';
export type SignalStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface MetricSignal {
  key: SignalKey;
  available: boolean;
  /** Raw headline value (coverage %, failing count, healthy count, …) or null. */
  value: number | null;
  /** Weight actually applied after renormalization (0..1). */
  weightApplied: number;
  status: SignalStatus;
  /** i18n key, not a translated string. */
  labelKey: string;
}

export interface Blocker {
  code: string;
  severity: Severity;
  labelKey: string;
  /** Numeric context for interpolation into the label. */
  detail: { count?: number; value?: number; threshold?: number };
  actionRoute: string;
  actionKey: string;
}

export interface ConfidenceResult {
  /** 0..100, or null when nothing is computable. */
  score: number | null;
  status: ConfidenceStatus;
  signals: MetricSignal[];
  blockers: Blocker[];
  hasEnoughData: boolean;
}

export type GateCheckId =
  | 'critical-tests'
  | 'no-failing'
  | 'coverage-threshold'
  | 'services-reachable'
  | 'no-critical-incidents'
  | 'smoke-scheduled';

export type GateCheckStatus = 'pass' | 'fail' | 'unknown';

/** Whether a failed check hard-blocks the release or is a soft warning. */
export type GateImpact = 'blocks' | 'warning';

export interface GateCheck {
  id: GateCheckId;
  status: GateCheckStatus;
  severity: Severity;
  impact: GateImpact;
  titleKey: string;
  descriptionKey: string;
  actionRoute: string;
  actionKey: string;
  /** Display-ready current / required values (numbers or '—'). */
  current: string;
  required: string;
  context: { value?: number; threshold?: number; count?: number };
}

/** The policy a release decision is evaluated against. */
export interface GatePolicy {
  coverageThreshold: number;
  failingTestsAllowed: number;
  unreachableServicesAllowed: number;
  openCriticalIncidentsAllowed: number;
  scheduledRunRequired: boolean;
  /** Whether release-critical tests must be defined & passing. */
  criticalTestsRequired: boolean;
}

export const DEFAULT_GATE_POLICY: GatePolicy = {
  coverageThreshold: 70,
  failingTestsAllowed: 0,
  unreachableServicesAllowed: 0,
  openCriticalIncidentsAllowed: 0,
  scheduledRunRequired: true,
  criticalTestsRequired: false,
};

/* ------------------------------------------------------------------ */
/*  Base weights — renormalized over available signals only            */
/* ------------------------------------------------------------------ */

const WEIGHTS: Record<SignalKey, number> = {
  coverage: 0.3,
  failingTests: 0.3,
  serviceHealth: 0.2,
  incidents: 0.15,
  schedules: 0.05,
};

const FAILING_STATUSES = new Set(['failed', 'error']);

/** Safe ratio: returns null when the denominator is not positive. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function statusFromScore(score: number | null): ConfidenceStatus {
  if (score === null) return 'unknown';
  if (score >= 85) return 'ready';
  if (score >= 65) return 'watch';
  if (score >= 40) return 'risky';
  return 'blocked';
}

/* ------------------------------------------------------------------ */
/*  Per-signal derivation — each returns a fractional health 0..1 or   */
/*  null (unavailable). Kept independent so consumers can reuse them.  */
/* ------------------------------------------------------------------ */

/** Coverage fraction (0..1) and headline % from a CoverageReport. */
export function coverageFraction(coverage?: CoverageReport | null): number | null {
  if (!coverage) return null;
  return ratio(coverage.covered_operations, coverage.total_operations);
}

/** Number of tests whose most recent run failed or errored. */
export function failingTestCount(tests?: TestItem[] | null): number | null {
  if (!tests || tests.length === 0) return tests == null ? null : 0;
  return tests.filter((t) => t.lastRunStatus && FAILING_STATUSES.has(t.lastRunStatus)).length;
}

/** { healthy, unreachable } counts over catalog entries with a known status. */
export function serviceHealthCounts(catalog?: CatalogEntry[] | null): { healthy: number; unreachable: number; known: number } | null {
  if (!catalog) return null;
  let healthy = 0;
  let unreachable = 0;
  for (const e of catalog) {
    if (e.health_status === 'healthy') healthy += 1;
    else if (e.health_status === 'unreachable') unreachable += 1;
  }
  const known = healthy + unreachable;
  return { healthy, unreachable, known };
}

export function activeScheduleCount(schedules?: ScheduleItem[] | null): number | null {
  if (!schedules) return null;
  return schedules.filter((s) => s.enabled).length;
}

/* ------------------------------------------------------------------ */
/*  Confidence score                                                   */
/* ------------------------------------------------------------------ */

export function computeConfidence(input: ConfidenceInput, opts: ConfidenceOptions = {}): ConfidenceResult {
  const coverageThreshold = opts.coverageThreshold ?? DEFAULT_COVERAGE_THRESHOLD;
  const signals: MetricSignal[] = [];

  // Coverage
  const covFrac = coverageFraction(input.coverage);
  const covPct = covFrac === null ? null : Math.round(covFrac * 100);
  signals.push({
    key: 'coverage',
    available: covFrac !== null,
    value: covPct,
    weightApplied: 0,
    status: covFrac === null ? 'unknown' : covPct! >= coverageThreshold ? 'pass' : covPct! >= coverageThreshold / 2 ? 'warn' : 'fail',
    labelKey: 'confidence.signalCoverage',
  });

  // Failing tests
  const failing = failingTestCount(input.tests);
  const totalTests = input.tests?.length ?? 0;
  const failFrac = failing === null ? null : ratio(totalTests - failing, totalTests);
  signals.push({
    key: 'failingTests',
    available: failing !== null && totalTests > 0,
    value: failing,
    weightApplied: 0,
    status: failing === null || totalTests === 0 ? 'unknown' : failing === 0 ? 'pass' : failing <= 2 ? 'warn' : 'fail',
    labelKey: 'confidence.signalFailing',
  });

  // Service health
  const health = serviceHealthCounts(input.catalog);
  const healthFrac = health && health.known > 0 ? ratio(health.healthy, health.known) : null;
  signals.push({
    key: 'serviceHealth',
    available: healthFrac !== null,
    value: health ? health.healthy : null,
    weightApplied: 0,
    status: healthFrac === null ? 'unknown' : health!.unreachable === 0 ? 'pass' : healthFrac >= 0.5 ? 'warn' : 'fail',
    labelKey: 'confidence.signalHealth',
  });

  // Open critical incidents
  const incidents = input.openCriticalIncidents;
  const incidentFrac = incidents == null ? null : incidents > 0 ? 0 : 1;
  signals.push({
    key: 'incidents',
    available: incidents != null,
    value: incidents ?? null,
    weightApplied: 0,
    status: incidents == null ? 'unknown' : incidents === 0 ? 'pass' : 'fail',
    labelKey: 'confidence.signalIncidents',
  });

  // Scheduled runs
  const activeSchedules = activeScheduleCount(input.schedules);
  const scheduleFrac = activeSchedules == null ? null : activeSchedules > 0 ? 1 : 0;
  signals.push({
    key: 'schedules',
    available: activeSchedules != null,
    value: activeSchedules,
    weightApplied: 0,
    status: activeSchedules == null ? 'unknown' : activeSchedules > 0 ? 'pass' : 'warn',
    labelKey: 'confidence.signalSchedules',
  });

  // Assemble fractions keyed by signal for weighting.
  const fractions: Record<SignalKey, number | null> = {
    coverage: covFrac,
    failingTests: failFrac,
    serviceHealth: healthFrac,
    incidents: incidentFrac,
    schedules: scheduleFrac,
  };

  // Renormalize weights over available signals only.
  const availableWeight = signals.reduce((sum, s) => (fractions[s.key] !== null ? sum + WEIGHTS[s.key] : sum), 0);

  let score: number | null = null;
  if (availableWeight > 0) {
    let acc = 0;
    for (const s of signals) {
      const frac = fractions[s.key];
      if (frac === null) continue;
      const w = WEIGHTS[s.key] / availableWeight;
      s.weightApplied = w;
      acc += frac * w;
    }
    score = clampScore(acc * 100);
  }

  const blockers = buildBlockers(input, { coverageThreshold, failing, covPct, health, incidents });

  return {
    score,
    status: statusFromScore(score),
    signals,
    blockers,
    hasEnoughData: availableWeight > 0,
  };
}

function buildBlockers(
  input: ConfidenceInput,
  ctx: {
    coverageThreshold: number;
    failing: number | null;
    covPct: number | null;
    health: { healthy: number; unreachable: number; known: number } | null;
    incidents: number | null | undefined;
  },
): Blocker[] {
  const blockers: Blocker[] = [];

  if (ctx.incidents != null && ctx.incidents > 0) {
    blockers.push({
      code: 'CRITICAL_INCIDENTS',
      severity: 'critical',
      labelKey: 'confidence.blockerIncidents',
      detail: { count: ctx.incidents },
      actionRoute: '/alerts',
      actionKey: 'confidence.actionReviewIncidents',
    });
  }

  if (ctx.failing != null && ctx.failing > 0) {
    blockers.push({
      code: 'FAILING_TESTS',
      severity: 'critical',
      labelKey: 'confidence.blockerFailing',
      detail: { count: ctx.failing },
      actionRoute: '/tests?tab=runs&status=failed',
      actionKey: 'confidence.actionOpenFailures',
    });
  }

  if (ctx.health && ctx.health.unreachable > 0) {
    blockers.push({
      code: 'UNREACHABLE_SERVICES',
      severity: 'warning',
      labelKey: 'confidence.blockerUnhealthy',
      detail: { count: ctx.health.unreachable },
      actionRoute: '/targets',
      actionKey: 'confidence.actionCheckServices',
    });
  }

  if (ctx.covPct != null && ctx.covPct < ctx.coverageThreshold) {
    blockers.push({
      code: 'LOW_COVERAGE',
      severity: 'warning',
      labelKey: 'confidence.blockerCoverage',
      detail: { value: ctx.covPct, threshold: ctx.coverageThreshold },
      actionRoute: '/targets',
      actionKey: 'confidence.actionGenerateCoverage',
    });
  }

  const activeSchedules = activeScheduleCount(input.schedules);
  if (activeSchedules === 0) {
    blockers.push({
      code: 'NO_SCHEDULE',
      severity: 'info',
      labelKey: 'confidence.blockerNoSchedule',
      detail: {},
      actionRoute: '/schedules',
      actionKey: 'confidence.actionScheduleSmoke',
    });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return blockers.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ------------------------------------------------------------------ */
/*  Release gate checks                                                */
/* ------------------------------------------------------------------ */

export function computeGateChecks(input: ConfidenceInput, opts: ConfidenceOptions = {}): GateCheck[] {
  const policy = opts.policy ?? DEFAULT_GATE_POLICY;
  const coverageThreshold = opts.coverageThreshold ?? policy.coverageThreshold;
  const criticalTag = opts.criticalTag ?? DEFAULT_CRITICAL_TAG;
  const num = (v: number | null | undefined) => (v == null ? '—' : String(v));
  const checks: GateCheck[] = [];

  // Critical tests all passing (unknown if none tagged critical).
  const criticalTests = (input.tests ?? []).filter((t) => t.tags?.includes(criticalTag));
  const criticalFailing = criticalTests.filter((t) => t.lastRunStatus && FAILING_STATUSES.has(t.lastRunStatus)).length;
  const criticalUnknown = input.tests == null || criticalTests.length === 0;
  checks.push({
    id: 'critical-tests',
    status: criticalUnknown ? 'unknown' : criticalFailing === 0 ? 'pass' : 'fail',
    severity: 'critical',
    impact: 'blocks',
    titleKey: 'releaseGates.checkCriticalTests',
    descriptionKey: criticalUnknown ? 'releaseGates.checkCriticalTestsUnknown' : 'releaseGates.checkCriticalTestsDesc',
    actionRoute: '/tests?filter=critical',
    actionKey: criticalUnknown ? 'releaseGates.actionMarkCritical' : 'releaseGates.actionViewCritical',
    current: criticalUnknown ? '—' : String(criticalFailing),
    required: '0',
    context: { count: criticalFailing },
  });

  // No failing tests overall.
  const failing = failingTestCount(input.tests);
  checks.push({
    id: 'no-failing',
    status: failing == null ? 'unknown' : failing <= policy.failingTestsAllowed ? 'pass' : 'fail',
    severity: 'critical',
    impact: 'blocks',
    titleKey: 'releaseGates.checkNoFailing',
    descriptionKey: 'releaseGates.checkNoFailingDesc',
    actionRoute: '/tests?tab=runs&status=failed',
    actionKey: 'releaseGates.actionOpenFailures',
    current: num(failing),
    required: String(policy.failingTestsAllowed),
    context: { count: failing ?? undefined },
  });

  // Coverage above threshold (soft warning).
  const covFrac = coverageFraction(input.coverage);
  const covPct = covFrac === null ? null : Math.round(covFrac * 100);
  checks.push({
    id: 'coverage-threshold',
    status: covPct == null ? 'unknown' : covPct >= coverageThreshold ? 'pass' : 'fail',
    severity: 'warning',
    impact: 'warning',
    titleKey: 'releaseGates.checkCoverage',
    descriptionKey: 'releaseGates.checkCoverageDesc',
    actionRoute: '/targets',
    actionKey: 'releaseGates.actionImproveCoverage',
    current: covPct == null ? '—' : `${covPct}%`,
    required: `≥${coverageThreshold}%`,
    context: { value: covPct ?? undefined, threshold: coverageThreshold },
  });

  // No unreachable services (hard block).
  const health = serviceHealthCounts(input.catalog);
  checks.push({
    id: 'services-reachable',
    status: health == null || health.known === 0 ? 'unknown' : health.unreachable <= policy.unreachableServicesAllowed ? 'pass' : 'fail',
    severity: 'critical',
    impact: 'blocks',
    titleKey: 'releaseGates.checkServices',
    descriptionKey: 'releaseGates.checkServicesDesc',
    actionRoute: '/targets',
    actionKey: 'releaseGates.actionCheckServices',
    current: num(health?.unreachable),
    required: String(policy.unreachableServicesAllowed),
    context: { count: health?.unreachable },
  });

  // No open critical incidents (hard block).
  const incidents = input.openCriticalIncidents;
  checks.push({
    id: 'no-critical-incidents',
    status: incidents == null ? 'unknown' : incidents <= policy.openCriticalIncidentsAllowed ? 'pass' : 'fail',
    severity: 'critical',
    impact: 'blocks',
    titleKey: 'releaseGates.checkIncidents',
    descriptionKey: 'releaseGates.checkIncidentsDesc',
    actionRoute: '/alerts',
    actionKey: 'releaseGates.actionReviewIncidents',
    current: num(incidents),
    required: String(policy.openCriticalIncidentsAllowed),
    context: { count: incidents ?? undefined },
  });

  // Scheduled smoke/regression exists (soft warning).
  const activeSchedules = activeScheduleCount(input.schedules);
  checks.push({
    id: 'smoke-scheduled',
    status: activeSchedules == null ? 'unknown' : !policy.scheduledRunRequired || activeSchedules > 0 ? 'pass' : 'fail',
    severity: 'info',
    impact: 'warning',
    titleKey: 'releaseGates.checkSmoke',
    descriptionKey: 'releaseGates.checkSmokeDesc',
    actionRoute: '/schedules',
    actionKey: 'releaseGates.actionScheduleSmoke',
    current: num(activeSchedules),
    required: policy.scheduledRunRequired ? '≥1' : '0',
    context: { count: activeSchedules ?? undefined },
  });

  return checks;
}

/** Derive an overall gate status from its checks (worst wins; ignores unknowns). */
export function gateStatusFromChecks(checks: GateCheck[]): ConfidenceStatus {
  const known = checks.filter((c) => c.status !== 'unknown');
  if (known.length === 0) return 'unknown';
  const failed = known.filter((c) => c.status === 'fail');
  if (failed.some((c) => c.severity === 'critical')) return 'blocked';
  if (failed.some((c) => c.severity === 'warning')) return 'risky';
  if (failed.length > 0) return 'watch';
  return 'ready';
}

/* ------------------------------------------------------------------ */
/*  Shared status → Tailwind palette (matches existing design tokens)  */
/* ------------------------------------------------------------------ */

export function statusColor(status: ConfidenceStatus): { text: string; bg: string; ring: string; dot: string } {
  switch (status) {
    case 'ready':
      return { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', dot: 'bg-emerald-500' };
    case 'watch':
      return { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', dot: 'bg-amber-500' };
    case 'risky':
      return { text: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-200', dot: 'bg-orange-500' };
    case 'blocked':
      return { text: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200', dot: 'bg-red-500' };
    default:
      return { text: 'text-slate-500', bg: 'bg-slate-50', ring: 'ring-slate-200', dot: 'bg-slate-400' };
  }
}
