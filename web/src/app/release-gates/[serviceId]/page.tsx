'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  fetchGate, fetchCatalog, fetchTests, fetchCoverage, evaluateCandidate, markBaseline,
  type GateSummary, type CatalogEntry, type TestItem, type CoverageReport, type TestDiff, type RegressionType,
} from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { HealthDot } from '@/components/catalog-chips';
import { NewReleaseModal } from '@/components/new-release-modal';
import {
  ShieldCheck, ArrowLeft, Rocket, Play, CheckCircle2, ArrowRight, Loader2, AlertCircle, ExternalLink,
  GitBranch, Boxes, Activity, Clock, Layers,
} from 'lucide-react';
import { cn, tkey, formatDate } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import { gateStatusColor, serviceCoveragePct, type GateStatus } from '@/lib/gate-status';

const DECISION_LABEL: Record<GateStatus, string> = {
  ready: 'releaseGates.decisionReady', watch: 'releaseGates.decisionReady', blocked: 'releaseGates.decisionBlocked',
  no_baseline: 'releaseGates.decisionNeedsReview', not_configured: 'releaseGates.svcNotConfigured', evaluating: 'releaseGates.svcEvaluating',
};
const DECISION_SENTENCE: Record<GateStatus, string> = {
  ready: 'releaseGates.sentenceServiceReady', watch: 'releaseGates.sentenceServiceReady', blocked: 'releaseGates.sentenceServiceBlocked',
  no_baseline: 'releaseGates.sentenceServiceNeedsReview', not_configured: 'releaseGates.noGateTests', evaluating: 'releaseGates.sentenceServiceEvaluating',
};
const REG_LABEL: Record<RegressionType, string> = {
  new_regression: 'releaseGates.regNew', known_failure: 'releaseGates.regKnown', fixed: 'releaseGates.regFixed',
  still_passing: 'releaseGates.regStable', new_test_failure: 'releaseGates.regNewFailure', new_test_passing: 'releaseGates.regNewPassing', missing: 'releaseGates.regNewPassing',
};
const REG_TONE: Record<RegressionType, string> = {
  new_regression: 'text-red-600', new_test_failure: 'text-amber-600', fixed: 'text-emerald-600',
  known_failure: 'text-slate-500', still_passing: 'text-slate-500', new_test_passing: 'text-slate-500', missing: 'text-slate-400',
};

type Tab = 'regressions' | 'coverage' | 'drift' | 'health' | 'runs';
type T = ReturnType<typeof useI18n>['t'];

export default function ServiceGateDetail() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const id = decodeURIComponent(serviceId);
  const { t } = useI18n();
  const localeStr = useLocaleString();

  const [gate, setGate] = useState<GateSummary | null>(null);
  const [service, setService] = useState<CatalogEntry | null>(null);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'eval' | 'baseline' | null>(null);
  const [tab, setTab] = useState<Tab>('regressions');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [g, cat, ts, cov] = await Promise.allSettled([fetchGate(id), fetchCatalog(), fetchTests(), fetchCoverage()]);
    setGate(g.status === 'fulfilled' ? g.value : null);
    setService(cat.status === 'fulfilled' ? cat.value.find((s) => s.id === id) ?? null : null);
    setTests(ts.status === 'fulfilled' ? ts.value : []);
    setCoverage(cov.status === 'fulfilled' ? cov.value : null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const testName = useMemo(() => {
    const m = new Map(tests.map((x) => [x.id, x.name]));
    return (tid: string) => m.get(tid) ?? tid;
  }, [tests]);
  // Operation each test covers on THIS service (for the Scope column).
  const opForTest = useMemo(() => {
    const m = new Map<string, string>();
    const svc = coverage?.services.find((s) => s.id === id);
    if (svc) for (const op of svc.operations ?? []) for (const tid of op.test_ids ?? []) if (!m.has(tid)) m.set(tid, op.name);
    return (tid: string) => m.get(tid) ?? null;
  }, [coverage, id]);

  const status: GateStatus = gate?.status ?? 'not_configured';
  const color = gateStatusColor(status);
  const cand = gate?.candidate ?? null;
  const base = gate?.baseline ?? null;
  const counts = gate?.counts;
  const covPct = serviceCoveragePct(coverage, id);
  const evaluated = !!cand && cand.results.length > 0;
  const blockingDiffs = (gate?.diffs ?? []).filter((d) => d.type === 'new_regression' || d.type === 'new_test_failure');

  const runGate = async () => {
    if (!cand) { setShowModal(true); return; }
    setBusy('eval');
    try { await evaluateCandidate(cand.id); await load(); } finally { setBusy(null); }
  };
  const doMarkBaseline = async () => {
    if (!cand) return;
    setBusy('baseline');
    try { await markBaseline(id, cand.id); await load(); } finally { setBusy(null); }
  };

  // Primary CTA depends on state.
  const primary: 'new' | 'run' | 'baseline' =
    !cand ? 'new' : !evaluated ? 'run' : status === 'blocked' ? 'run' : 'baseline';

  if (loading) {
    return <div className="space-y-4"><div className="skeleton h-8 w-64" /><div className="skeleton h-14" /><div className="grid grid-cols-12 gap-4"><div className="col-span-7 skeleton h-52" /><div className="col-span-5 skeleton h-52" /></div></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header + CTAs */}
      <div>
        <Link href="/release-gates" className="mb-2 inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-slate-700">
          <ArrowLeft className="h-3 w-3" />{t.releaseGates.title}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900">
              <ShieldCheck className="h-5 w-5 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{service?.name || id}</h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {cand
                  ? tkey(t, 'releaseGates.validatingAgainst', { candidate: candLabel(cand), baseline: base?.label || t.releaseGates.noBaselineContext })
                  : t.releaseGates.noCandidateContext}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary CTA (state-aware) */}
            {primary === 'baseline' ? (
              <button onClick={doMarkBaseline} disabled={busy === 'baseline'} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {busy === 'baseline' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{t.releaseGates.markAsBaseline}
              </button>
            ) : (
              <button onClick={runGate} disabled={busy === 'eval'} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                {busy === 'eval' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{t.releaseGates.runGate}
              </button>
            )}
            {/* Secondary */}
            <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50">
              <Rocket className="h-3.5 w-3.5" />{t.releaseGates.newRelease}
            </button>
            <span title={t.releaseGates.promoteSoon} className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-300">
              {t.releaseGates.promoteRelease}
            </span>
          </div>
        </div>
      </div>

      {/* Release Context Bar */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:grid-cols-5">
        <CtxCell icon={Boxes} label={t.releaseGates.colService} value={service?.name || id} />
        <CtxCell icon={Layers} label={t.releaseGates.environment} value={cand?.environment || '—'} />
        <CtxCell icon={Rocket} label={t.releaseGates.colCandidate} value={cand ? candLabel(cand) : t.releaseGates.noCandidateContext} />
        <CtxCell icon={GitBranch} label={t.releaseGates.colBaseline} value={base?.label || t.releaseGates.noBaselineContext} />
        <CtxCell icon={Clock} label={t.releaseGates.lastEvaluated} value={gate?.last_evaluated_at ? formatDate(gate.last_evaluated_at, localeStr) : t.releaseGates.notEvaluatedYet} />
      </div>

      {/* Verdict + comparison */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
        {/* Verdict */}
        <div className={cn('lg:col-span-7 rounded-xl border p-4', color.border, color.bg)}>
          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', color.dot)} />
            <span className={cn('text-2xl font-bold tracking-tight', color.text)}>{tkey(t, DECISION_LABEL[status])}</span>
          </div>
          <p className="mt-1 text-[13px] text-slate-600">{tkey(t, DECISION_SENTENCE[status])}</p>
          {cand && (
            <div className="mt-1 font-mono text-[12px] text-slate-500">
              {tkey(t, 'releaseGates.candidateArrowBaseline', { candidate: candLabel(cand), baseline: base?.label || '—' })}
            </div>
          )}
          {/* mini metric chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip label={t.releaseGates.mNewRegressions} value={counts?.new_regressions ?? '—'} tone={counts && counts.new_regressions > 0 ? 'red' : 'slate'} />
            <Chip label={t.releaseGates.mStillPassing} value={counts?.still_passing ?? '—'} tone="emerald" />
            <Chip label={t.overview.serviceHealth} value={service?.health_status === 'healthy' ? 'OK' : service?.health_status === 'unreachable' ? '!' : '—'} tone={service?.health_status === 'healthy' ? 'emerald' : service?.health_status === 'unreachable' ? 'red' : 'slate'} />
            <Chip label={t.releaseGates.colCoverage} value={covPct == null ? '—' : `${covPct}%`} tone={covPct == null ? 'slate' : covPct >= 70 ? 'slate' : 'amber'} />
            <Chip label={t.overview.lastValidation} value={gate?.last_evaluated_at ? formatDate(gate.last_evaluated_at, localeStr).split(',')[0] : '—'} tone="slate" />
          </div>
        </div>

        {/* Comparison summary */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">{t.releaseGates.comparedToBaseline}</div>
          {!base ? (
            <p className="mt-2 text-[12px] text-slate-400">{t.releaseGates.evRegressionRequiresBaseline}</p>
          ) : counts ? (
            <div className="mt-3 space-y-2">
              <CmpRow color="bg-red-500" label={t.releaseGates.mNewRegressions} value={counts.new_regressions} strong={counts.new_regressions > 0} />
              <CmpRow color="bg-emerald-500" label={t.releaseGates.mStillPassing} value={counts.still_passing} />
              <CmpRow color="bg-emerald-400" label={t.releaseGates.mFixed} value={counts.fixed} />
              <CmpRow color="bg-slate-400" label={t.releaseGates.mKnownFailures} value={counts.known_failures} />
              <CmpRow color="bg-amber-500" label={t.releaseGates.mNewTestFailures} value={counts.new_test_failures} strong={counts.new_test_failures > 0} />
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-slate-400">{t.releaseGates.notEvaluatedYet}</p>
          )}
        </div>
      </div>

      {/* Blocking this release (state-aware) */}
      {blockingDiffs.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-[13px]">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          <span className="font-medium text-emerald-700">{base ? t.releaseGates.noBlockersSuccess : t.releaseGates.evRegressionRequiresBaseline}</span>
        </div>
      ) : (
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <AlertCircle className="h-4 w-4 text-red-500" />{t.releaseGates.blockingTitle}
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{blockingDiffs.length}</span>
          </div>
          <div className="space-y-2">
            {blockingDiffs.map((d) => (
              <div key={d.test_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                <AlertCircle className={cn('h-4 w-4 flex-shrink-0', d.type === 'new_regression' ? 'text-red-500' : 'text-amber-500')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-slate-800">{testName(d.test_id)}</span>
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', d.type === 'new_regression' ? 'bg-red-50 text-red-600 ring-red-200' : 'bg-amber-50 text-amber-600 ring-amber-200')}>{tkey(t, REG_LABEL[d.type])}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">{opForTest(d.test_id) ?? d.test_id} · {d.baseline_status || '—'} → {d.candidate_status}</div>
                </div>
                <Link href={`/runs?test_id=${encodeURIComponent(d.test_id)}`} className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800">
                  {t.releaseGates.evOpenRun}<ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-3">
          {([
            ['regressions', t.releaseGates.tabRegressions],
            ['coverage', t.releaseGates.tabCoverageDelta],
            ['drift', t.releaseGates.tabApiDrift],
            ['health', t.releaseGates.tabServiceHealth],
            ['runs', t.releaseGates.tabRunHistory],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold border-b-2 -mb-px', tab === k ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700')}>{label}</button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'regressions' && <RegressionsTab gate={gate} base={base} testName={testName} opForTest={opForTest} t={t} />}
          {tab === 'coverage' && <CoverageTab coverage={coverage} serviceId={id} t={t} />}
          {tab === 'drift' && <DriftTab service={service} t={t} />}
          {tab === 'health' && <HealthTab service={service} t={t} localeStr={localeStr} />}
          {tab === 'runs' && <RunsTab gate={gate} testName={testName} t={t} />}
        </div>
      </div>

      {showModal && (
        <NewReleaseModal services={service ? [service] : []} coverage={coverage} preselectedServiceId={id} onClose={() => { setShowModal(false); load(); }} />
      )}
    </div>
  );
}

function candLabel(c: NonNullable<GateSummary['candidate']>): string {
  return c.label || c.target_version || c.id.slice(0, 8);
}

/* ── small bits ── */
function CtxCell({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Icon className="h-3 w-3" />{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-medium text-slate-800" title={value}>{value}</div>
    </div>
  );
}
function Chip({ label, value, tone }: { label: string; value: string | number; tone: 'red' | 'amber' | 'emerald' | 'slate' }) {
  const c = { red: 'bg-red-50 text-red-700 ring-red-200', amber: 'bg-amber-50 text-amber-700 ring-amber-200', emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200', slate: 'bg-white text-slate-700 ring-slate-200' }[tone];
  return (
    <div className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ring-1', c)}>
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</span>
    </div>
  );
}
function CmpRow({ color, label, value, strong }: { color: string; label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', color)} />
      <span className="flex-1 text-[13px] text-slate-600">{label}</span>
      <span className={cn('text-[14px] font-bold tabular-nums', strong ? 'text-slate-900' : 'text-slate-500')}>{value}</span>
    </div>
  );
}
function SummaryBar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg bg-slate-50/60 px-3 py-2 text-[12px]">{children}</div>;
}
function SumStat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return <span><span className={cn('font-bold tabular-nums', tone ?? 'text-slate-800')}>{value}</span> <span className="text-slate-400">{label}</span></span>;
}
function Empty({ msg }: { msg: string }) {
  return <div className="py-8 text-center text-[13px] text-slate-400">{msg}</div>;
}
function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return <th className={cn('py-2 pr-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400', right && 'text-right')}>{children}</th>;
}

/* ── evidence tabs ── */
function RegressionsTab({ gate, base, testName, opForTest, t }: { gate: GateSummary | null; base: GateSummary['baseline']; testName: (id: string) => string; opForTest: (id: string) => string | null; t: T }) {
  const diffs = gate?.diffs ?? [];
  const c = gate?.counts;
  if (diffs.length === 0) return <Empty msg={base ? t.releaseGates.evNoRegressions : t.releaseGates.evRegressionRequiresBaseline} />;
  return (
    <div>
      {c && (
        <SummaryBar>
          <SumStat label={t.releaseGates.mNewRegressions} value={c.new_regressions} tone={c.new_regressions > 0 ? 'text-red-600' : 'text-slate-800'} />
          <SumStat label={t.releaseGates.mFixed} value={c.fixed} tone="text-emerald-600" />
          <SumStat label={t.releaseGates.mKnownFailures} value={c.known_failures} />
          <SumStat label={t.releaseGates.mNewTestFailures} value={c.new_test_failures} tone={c.new_test_failures > 0 ? 'text-amber-600' : 'text-slate-800'} />
          <SumStat label={t.releaseGates.mStillPassing} value={c.still_passing} />
        </SummaryBar>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-slate-100"><Th>{t.releaseGates.evTest}</Th><Th>{t.releaseGates.colScope}</Th><Th>{t.releaseGates.colBaselineResult}</Th><Th>{t.releaseGates.colCandidateResult}</Th><Th>{t.releaseGates.colRegressionType}</Th><Th right /></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {diffs.map((d: TestDiff) => (
              <tr key={d.test_id} className="hover:bg-slate-50/60">
                <td className="py-2.5 pr-3 font-medium text-slate-800">{testName(d.test_id)}</td>
                <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-500">{opForTest(d.test_id) ?? '—'}</td>
                <td className="py-2.5 pr-3">{d.baseline_status ? <StatusBadge status={d.baseline_status} size="xs" /> : <span className="text-slate-300">—</span>}</td>
                <td className="py-2.5 pr-3"><StatusBadge status={d.candidate_status} size="xs" /></td>
                <td className={cn('py-2.5 pr-3 text-[11px] font-semibold', REG_TONE[d.type])}>{tkey(t, REG_LABEL[d.type])}</td>
                <td className="py-2.5 text-right">
                  <Link href={`/runs?test_id=${encodeURIComponent(d.test_id)}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700">{t.releaseGates.evOpenRun}<ExternalLink className="h-3 w-3" /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageTab({ coverage, serviceId, t }: { coverage: CoverageReport | null; serviceId: string; t: T }) {
  const svc = coverage?.services.find((s) => s.id === serviceId);
  if (!svc || svc.total === 0) return <Empty msg={t.releaseGates.evNoCoverage} />;
  const uncovered = svc.operations.filter((o) => !o.covered);
  return (
    <div>
      <SummaryBar>
        <SumStat label={t.releaseGates.evTotalOps} value={svc.total} />
        <SumStat label={t.releaseGates.evCoveredOps} value={svc.covered} tone="text-emerald-600" />
        <SumStat label={t.releaseGates.evUncoveredOps} value={svc.total - svc.covered} tone={svc.total - svc.covered > 0 ? 'text-red-600' : 'text-slate-800'} />
      </SummaryBar>
      {uncovered.length === 0 ? <Empty msg={t.releaseGates.evNoCoverage} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-slate-100"><Th>{t.releaseGates.colScope}</Th><Th right>{t.releaseGates.evStatus}</Th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {uncovered.map((o) => (
                <tr key={o.name} className="hover:bg-slate-50/60">
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-slate-700">{o.name}</td>
                  <td className="py-2.5 text-right"><span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">{t.releaseGates.evUncoveredOps}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DriftTab({ service, t }: { service: CatalogEntry | null; t: T }) {
  if (!service?.drift_summary) return <Empty msg={t.releaseGates.evNoDrift} />;
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-slate-400">{t.releaseGates.evDriftSoon}</p>
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 font-mono text-[12px] text-amber-700">{service.drift_summary}</div>
    </div>
  );
}

function HealthTab({ service, t, localeStr }: { service: CatalogEntry | null; t: T; localeStr: string }) {
  if (!service) return <Empty msg={t.releaseGates.evNoServices} />;
  return (
    <div>
      <SummaryBar>
        <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-slate-400" /><HealthDot status={service.health_status} showLabel /></span>
        <SumStat label={t.releaseGates.evLatency} value={service.latency_ms != null ? `${service.latency_ms}ms` : '—'} />
      </SummaryBar>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-slate-100"><Th>{t.releaseGates.evService}</Th><Th>{t.releaseGates.evStatus}</Th><Th right>{t.releaseGates.evLatency}</Th><Th>{t.releaseGates.evLastChecked}</Th></tr></thead>
          <tbody>
            <tr className="hover:bg-slate-50/60">
              <td className="py-2.5 pr-3 font-mono text-slate-700">{service.name || service.id}</td>
              <td className="py-2.5 pr-3"><HealthDot status={service.health_status} showLabel /></td>
              <td className="py-2.5 pr-3 text-right font-mono text-slate-600">{service.latency_ms != null ? `${service.latency_ms}ms` : '—'}</td>
              <td className="py-2.5 pr-3 text-slate-500">{service.last_health_at ? formatDate(service.last_health_at, localeStr) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RunsTab({ gate, testName, t }: { gate: GateSummary | null; testName: (id: string) => string; t: T }) {
  const results = gate?.candidate?.results ?? [];
  if (results.length === 0) return <Empty msg={t.releaseGates.evNoEvaluations} />;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.length - passed;
  return (
    <div>
      <SummaryBar>
        <SumStat label={t.releaseGates.evTest} value={results.length} />
        <SumStat label={t.releaseGates.resultPassed} value={passed} tone="text-emerald-600" />
        <SumStat label={t.releaseGates.resultFailed} value={failed} tone={failed > 0 ? 'text-red-600' : 'text-slate-800'} />
      </SummaryBar>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-slate-100"><Th>{t.releaseGates.evStatus}</Th><Th>{t.releaseGates.evTest}</Th><Th right /></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {results.map((r) => (
              <tr key={r.test_id} className="hover:bg-slate-50/60">
                <td className="py-2.5 pr-3"><StatusBadge status={r.status} size="xs" /></td>
                <td className="py-2.5 pr-3 font-medium text-slate-800">{testName(r.test_id)}</td>
                <td className="py-2.5 text-right"><Link href={`/runs/${r.run_id}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700">{t.releaseGates.evOpenRun}<ExternalLink className="h-3 w-3" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
