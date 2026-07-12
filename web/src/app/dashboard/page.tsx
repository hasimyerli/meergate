'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchTests, fetchRuns, fetchCoverage, fetchCatalog, fetchGates,
  type TestItem, type RunItem, type CoverageReport, type CatalogEntry, type GateSummary,
} from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { StatCard } from '@/components/stat-card';
import { NewReleaseModal } from '@/components/new-release-modal';
import { ServiceGateBoard } from '@/components/service-gate-board';
import {
  Boxes, ShieldX, ShieldAlert, ShieldCheck, Rocket, ArrowRight, ChevronRight, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { cn, tkey, formatDate, formatDuration } from '@/lib/utils';
import {
  gateStatusColor, GATE_STATUS_LABEL, serviceCoveragePct, coverageHasTests, testServiceMap, type GateStatus,
} from '@/lib/gate-status';
import { useI18n, useLocaleString } from '@/lib/i18n';

const FAILING = new Set(['failed', 'error']);
const COVERAGE_THRESHOLD = 70;

interface ServiceItem {
  id: string;
  name: string;
  status: GateStatus;
  severity: 'red' | 'amber' | 'slate';
  reasonKey: string;
  reasonDetail: { count?: number };
  actionKey: string;
  actionRoute: string;
}

export default function ServiceOverviewPage() {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const [tests, setTests] = useState<TestItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [gates, setGates] = useState<Record<string, GateSummary>>({});
  const [loading, setLoading] = useState(true);
  const [modalService, setModalService] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    const [ts, r, cov, cat, g] = await Promise.allSettled([
      fetchTests(), fetchRuns({ limit: 30 }), fetchCoverage(), fetchCatalog(), fetchGates(),
    ]);
    setTests(ts.status === 'fulfilled' ? ts.value ?? [] : []);
    setRuns(r.status === 'fulfilled' ? r.value.runs ?? [] : []);
    setCoverage(cov.status === 'fulfilled' ? cov.value : null);
    setCatalog(cat.status === 'fulfilled' ? cat.value : []);
    setGates(g.status === 'fulfilled' ? g.value : {});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const testToService = useMemo(() => testServiceMap(coverage), [coverage]);
  const serviceName = useMemo(() => {
    const m = new Map(catalog.map((c) => [c.id, c.name || c.id]));
    return (id: string) => m.get(id) ?? id;
  }, [catalog]);
  const testName = useMemo(() => {
    const m = new Map(tests.map((x) => [x.id, x.name]));
    return (id: string) => m.get(id) ?? id;
  }, [tests]);

  const statusOf = useCallback((svc: CatalogEntry): GateStatus =>
    gates[svc.id]?.status ?? (coverageHasTests(coverage, svc.id) ? 'no_baseline' : 'not_configured'),
  [gates, coverage]);

  const failingByService = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of tests) {
      if (x.lastRunStatus && FAILING.has(x.lastRunStatus)) {
        const svc = testToService.get(x.id);
        if (svc) m.set(svc, (m.get(svc) ?? 0) + 1);
      }
    }
    return m;
  }, [tests, testToService]);

  const summary = useMemo(() => {
    let blocked = 0, risky = 0, ready = 0;
    for (const svc of catalog) {
      const s = statusOf(svc);
      if (s === 'blocked') blocked++;
      else if (s === 'watch') risky++;
      else if (s === 'ready') ready++;
    }
    const candidates = Object.values(gates).filter((g) => g.candidate).length;
    return { total: catalog.length, blocked, risky, ready, candidates };
  }, [catalog, gates, statusOf]);

  // Per-service attention / next-step items (real signals only).
  const serviceItems = useMemo<ServiceItem[]>(() => {
    const items: ServiceItem[] = [];
    for (const svc of catalog) {
      const status = statusOf(svc);
      const gate = gates[svc.id];
      const covPct = serviceCoveragePct(coverage, svc.id);
      const base = { id: svc.id, name: svc.name || svc.id, status };
      if (status === 'blocked') {
        const newReg = gate?.counts.new_regressions ?? 0;
        items.push({
          ...base, severity: 'red',
          reasonKey: newReg > 0 ? 'overview.reasonNewRegressions' : 'overview.reasonFailingTests',
          reasonDetail: { count: newReg > 0 ? newReg : (failingByService.get(svc.id) ?? 0) },
          actionKey: 'overview.actionOpenGate', actionRoute: `/release-gates/${encodeURIComponent(svc.id)}`,
        });
      } else if (svc.health_status === 'unreachable') {
        items.push({ ...base, severity: 'amber', reasonKey: 'overview.reasonUnreachable', reasonDetail: {}, actionKey: 'overview.actionCheckService', actionRoute: '/targets' });
      } else if ((failingByService.get(svc.id) ?? 0) > 0) {
        items.push({ ...base, severity: 'red', reasonKey: 'overview.reasonFailingTests', reasonDetail: { count: failingByService.get(svc.id) }, actionKey: 'overview.actionOpenGate', actionRoute: `/release-gates/${encodeURIComponent(svc.id)}` });
      } else if (covPct != null && covPct < COVERAGE_THRESHOLD) {
        items.push({ ...base, severity: 'amber', reasonKey: 'overview.reasonCoverageLow', reasonDetail: {}, actionKey: 'overview.actionGenerateCoverageShort', actionRoute: '/targets' });
      } else if (status === 'not_configured') {
        items.push({ ...base, severity: 'slate', reasonKey: 'overview.reasonNoCoverage', reasonDetail: {}, actionKey: 'overview.actionGenerateCoverageShort', actionRoute: '/targets' });
      }
    }
    const rank = { red: 0, amber: 1, slate: 2 };
    return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [catalog, gates, coverage, statusOf, failingByService]);

  const recentRuns = runs.slice(0, 10);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[88px]" />)}</div>
        <div className="skeleton h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.overview.serviceReleaseTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{t.overview.serviceReleaseSubtitle}</p>
        </div>
        <button onClick={() => setModalService(null)} disabled={catalog.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          <Rocket className="h-4 w-4" />{t.releaseGates.newRelease}
        </button>
      </div>

      {catalog.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
          <Boxes className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">{t.releaseGates.emptyNoServicesTitle}</p>
          <p className="mt-1 text-[13px] text-slate-400">{t.releaseGates.emptyNoServicesDesc}</p>
          <Link href="/targets" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">{t.releaseGates.openServiceCatalog}<ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label={t.overview.totalServices} value={summary.total} icon={<Boxes className="h-4 w-4 text-indigo-600" strokeWidth={1.75} />} tone={{ bg: 'bg-indigo-50' }} href="/targets" />
            <StatCard label={t.overview.blockedGates} value={summary.blocked} icon={<ShieldX className="h-4 w-4 text-red-500" strokeWidth={1.75} />} tone={{ bg: 'bg-red-50', text: summary.blocked > 0 ? 'text-red-600' : undefined }} href="/release-gates" />
            <StatCard label={t.overview.riskyServices} value={summary.risky} icon={<ShieldAlert className="h-4 w-4 text-amber-500" strokeWidth={1.75} />} tone={{ bg: 'bg-amber-50', text: summary.risky > 0 ? 'text-amber-600' : undefined }} href="/release-gates" />
            <StatCard label={t.overview.readyServices} value={summary.ready} icon={<ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />} tone={{ bg: 'bg-emerald-50' }} href="/release-gates" />
            <StatCard label={t.overview.activeCandidates} value={summary.candidates} icon={<Rocket className="h-4 w-4 text-slate-600" strokeWidth={1.75} />} tone={{ bg: 'bg-slate-50' }} href="/release-gates" />
          </div>

          {/* Service Release Board */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">{t.overview.serviceReleaseBoard}</h2>
              <Link href="/release-gates" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">{t.common.viewAll}<ArrowRight className="h-3 w-3" /></Link>
            </div>
            <ServiceGateBoard services={catalog} gates={gates} coverage={coverage} onNewRelease={(sid) => setModalService(sid)} />
          </div>

          {/* Recommended next steps + Recent validations | Attention */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-8 space-y-5">
              {/* Recommended next steps (service context) */}
              <div className="card overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">{t.overview.recommendedNextSteps}</div>
                {serviceItems.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{t.overview.allServicesHealthy}</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {serviceItems.slice(0, 6).map((it) => (
                      <Link key={it.id} href={it.actionRoute} className="group flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50/60">
                        <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', it.severity === 'red' ? 'bg-red-500' : it.severity === 'amber' ? 'bg-amber-500' : 'bg-slate-300')} />
                        <div className="min-w-0 flex-1">
                          <span className="text-[13px] font-medium text-slate-800">{it.name}</span>
                          <span className="text-[12px] text-slate-400"> · {tkey(t, it.reasonKey, it.reasonDetail as Record<string, string | number>)}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-indigo-600 group-hover:text-indigo-700">{tkey(t, it.actionKey)}<ArrowRight className="h-3.5 w-3.5" /></span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent validations (with service context) */}
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">{t.overview.recentValidations}</h2>
                  <Link href="/tests?tab=runs" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">{t.common.viewAll}<ArrowRight className="h-3 w-3" /></Link>
                </div>
                {recentRuns.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">{t.dashboard.noRunsYet}</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {recentRuns.map((run) => {
                      const svcId = testToService.get(run.test_id);
                      return (
                        <Link key={run.id} href={`/runs/${run.id}`} className="flex items-center gap-4 px-5 py-2.5 hover:bg-slate-50/50">
                          <StatusBadge status={run.status} size="xs" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-slate-800">
                              <span className="text-slate-500">{svcId ? serviceName(svcId) : t.overview.unassignedService}</span>
                              <span className="text-slate-300"> · </span>{testName(run.test_id)}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">{formatDate(run.created_at, localeStr)}</div>
                          </div>
                          <span className="font-mono text-[11px] font-medium text-slate-600">{formatDuration(run.duration_ms)}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Attention required (service-based) */}
            <div className="lg:col-span-4">
              <div className="card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-slate-900">{t.dashboard.attentionRequired}</h2>
                </div>
                {serviceItems.filter((i) => i.severity !== 'slate').length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{t.overview.allServicesHealthy}</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {serviceItems.filter((i) => i.severity !== 'slate').slice(0, 6).map((it) => {
                      const c = gateStatusColor(it.status);
                      return (
                        <Link key={it.id} href={`/release-gates/${encodeURIComponent(it.id)}`} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-50/60">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-slate-800">{it.name}</div>
                            <div className="text-[11px] text-slate-400">{tkey(t, it.reasonKey, it.reasonDetail as Record<string, string | number>)}</div>
                          </div>
                          <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', c.bg, c.text, c.ring)}>{tkey(t, GATE_STATUS_LABEL[it.status])}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {modalService !== undefined && (
        <NewReleaseModal services={catalog} coverage={coverage} preselectedServiceId={modalService ?? undefined} onClose={() => { setModalService(undefined); load(); }} />
      )}
    </div>
  );
}
