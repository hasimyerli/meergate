'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchTestManifest, fetchTestStats, fetchRuns, fetchCoverage,
  runSingleTest,
  type TestStats, type RunItem, type RunContext, type CoverageReport,
} from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { RunWithParamsDialog } from '@/components/run-with-params-dialog';
import { formatDate, formatDuration, cn, tkey } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import {
  ArrowLeft, Play, SlidersHorizontal, ExternalLink, Loader2,
  BarChart3, CheckCircle2, XCircle, Clock, TrendingUp,
  X, ChevronRight, ChevronLeft,
  Tag, User, Layers, FileText,
} from 'lucide-react';

interface ManifestData {
  id: string;
  name: string;
  description?: string;
  suite: string;
  tags: string[];
  version?: number;
  owner?: string;
  mode?: string;
  config?: Record<string, unknown>;
  params?: Record<string, string>;
  steps?: Array<{ name: string; type: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

const PAGE_SIZE = 15;

export default function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const localeStr = useLocaleString();

  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [stats, setStats] = useState<TestStats | null>(null);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runTriggered, setRunTriggered] = useState(false);
  const [showParamsDialog, setShowParamsDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'runs' | 'manifest'>('runs');
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);

  const loadManifest = useCallback(async () => {
    try {
      const data = await fetchTestManifest(id);
      setManifest(data as ManifestData);
    } catch (err) {
      console.error('Failed to load manifest:', err);
    }
  }, [id]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchTestStats(id));
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, [id]);

  const loadRuns = useCallback(async (page = 0) => {
    setRunsLoading(true);
    try {
      const data = await fetchRuns({ test_id: id, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setRuns(data.runs ?? []);
      setRunsTotal(data.total ?? 0);
    } catch (err) {
      console.error('Failed to load runs:', err);
    } finally {
      setRunsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadManifest(), loadStats(), loadRuns(0)])
      .finally(() => setLoading(false));
    // Coverage is a best-effort context overlay — never blocks the page.
    fetchCoverage().then(setCoverage).catch(() => setCoverage(null));
  }, [loadManifest, loadStats, loadRuns]);

  // How many discovered operations this test currently covers.
  const coversCount = useMemo(() => {
    if (!coverage) return null;
    let n = 0;
    for (const svc of coverage.services) {
      for (const op of svc.operations ?? []) {
        if (op.test_ids?.includes(id)) n += 1;
      }
    }
    return n;
  }, [coverage, id]);

  useEffect(() => {
    loadRuns(runsPage);
  }, [runsPage, loadRuns]);

  const handleRun = async () => {
    setRunTriggered(true);
    try {
      await runSingleTest(id, 'real');
      setTimeout(() => {
        loadStats();
        loadRuns(0);
        setRunTriggered(false);
      }, 1500);
    } catch {
      setRunTriggered(false);
    }
  };

  const handleRunWithParams = async (mode: string, overrides: Record<string, string>, context?: RunContext, sessionId?: string) => {
    setRunTriggered(true);
    try {
      await runSingleTest(id, mode, overrides, context, sessionId);
      setTimeout(() => {
        loadStats();
        loadRuns(0);
        setRunTriggered(false);
      }, 1500);
    } catch {
      setRunTriggered(false);
    }
  };

  const runsTotalPages = Math.ceil(runsTotal / PAGE_SIZE);

  const lastRunStatus = useMemo(() => {
    if (runs.length > 0) return runs[0]!.status;
    return null;
  }, [runs]);

  if (loading && !manifest) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="py-32 text-center">
        <p className="text-slate-500">Test not found: {id}</p>
        <Link href="/tests" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />{t.common.back}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/tests" className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-slate-700 mb-2">
            <ArrowLeft className="h-3 w-3" />{t.common.back}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 truncate">{manifest.name}</h1>
            {lastRunStatus && <StatusBadge status={lastRunStatus} size="sm" />}
          </div>
          <p className="mt-1 text-[12px] font-mono text-slate-400">{manifest.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleRun} disabled={runTriggered}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
            {runTriggered ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {t.common.run}
          </button>
          <button onClick={() => setShowParamsDialog(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
            <SlidersHorizontal className="h-3.5 w-3.5" />Params
          </button>
          <Link href={`/builder?load=${manifest.id}`}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
            <ExternalLink className="h-3.5 w-3.5" />{t.nav.builder}
          </Link>
        </div>
      </div>

      {/* ── Release context strip (only what we actually know) ── */}
      {(() => {
        const isCritical = manifest.tags?.includes('critical');
        const firstStep = manifest.steps?.find((s) => ['grpcCall', 'apiCall', 'wsSubscribe'].includes(s.type));
        const cfg = firstStep?.config as Record<string, unknown> | undefined;
        const target = firstStep
          ? firstStep.type === 'apiCall'
            ? [cfg?.method, cfg?.path].filter(Boolean).join(' ') || firstStep.name
            : firstStep.type === 'grpcCall'
              ? String(cfg?.service ?? firstStep.name)
              : firstStep.name
          : null;
        const hasContext = target || isCritical || (coversCount != null && coversCount > 0);
        if (!hasContext) return null;
        return (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200/80 bg-slate-50/60 px-5 py-3 text-[12px]">
            {target && <MetaItem icon={Layers} label={t.tests.validationTarget} value={target} />}
            {isCritical && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">{t.tests.releaseImpact}:</span>
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-inset ring-red-200">{t.tests.releaseCritical}</span>
              </div>
            )}
            {coversCount != null && coversCount > 0 && (
              <MetaItem icon={BarChart3} label={t.tests.coverageContribution} value={tkey(t, 'tests.coversOperations', { count: coversCount })} />
            )}
          </div>
        );
      })()}

      {/* ── Description + Metadata ── */}
      <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm">
        <div className="px-5 py-4">
          {manifest.description && (
            <p className="text-[13px] text-slate-700 leading-relaxed mb-4">{manifest.description}</p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
            {manifest.owner && <MetaItem icon={User} label="Owner" value={manifest.owner} />}
            {manifest.version != null && <MetaItem icon={FileText} label={t.settings.version} value={`v${manifest.version}`} />}
            {manifest.config?.timeout != null && <MetaItem icon={Clock} label="Timeout" value={`${String(manifest.config.timeout)}ms`} />}
            {manifest.tags && manifest.tags.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-400">{t.sessions.tags}:</span>
                <div className="flex flex-wrap gap-1">
                  {manifest.tags.map((tag) => (
                    <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {manifest.params && Object.keys(manifest.params).length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parameters</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(manifest.params).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] ring-1 ring-inset ring-blue-200">
                    <span className="font-semibold text-blue-700">{k}</span>
                    <span className="text-blue-500">=</span>
                    <span className="text-blue-600">{v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={BarChart3} label={t.analytics.totalRuns} value={stats.totalRuns} color="text-slate-700" bg="bg-slate-50" />
          <StatCard icon={CheckCircle2} label={t.dashboard.passRate} value={`${stats.passRate.toFixed(0)}%`}
            color={stats.passRate >= 90 ? 'text-emerald-700' : stats.passRate >= 70 ? 'text-amber-700' : 'text-red-700'}
            bg={stats.passRate >= 90 ? 'bg-emerald-50' : stats.passRate >= 70 ? 'bg-amber-50' : 'bg-red-50'} />
          <StatCard icon={Clock} label={t.analytics.avgDuration} value={formatDuration(stats.avgDurationMs)} color="text-blue-700" bg="bg-blue-50" />
          <StatCard icon={TrendingUp} label={t.analytics.flakeScore} value={stats.flakeScore.toFixed(0)}
            color={stats.flakeScore < 30 ? 'text-emerald-700' : stats.flakeScore <= 60 ? 'text-amber-700' : 'text-red-700'}
            bg={stats.flakeScore < 30 ? 'bg-emerald-50' : stats.flakeScore <= 60 ? 'bg-amber-50' : 'bg-red-50'} />
        </div>
      )}

      {/* ── Trend sparkline ── */}
      {stats && stats.last10Statuses && stats.last10Statuses.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last {stats.last10Statuses.length} runs:</span>
          <div className="flex items-center gap-0.5">
            {stats.last10Statuses.map((s, i) => (
              <span key={i} className={cn('h-3 w-3 rounded-sm',
                s === 'passed' ? 'bg-emerald-500' : s === 'failed' ? 'bg-red-500' : s === 'error' ? 'bg-amber-500' : 'bg-slate-300'
              )} title={s} />
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(['runs', 'manifest'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors -mb-px capitalize',
              activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700')}>
            {tab === 'runs' && `Run History${runsTotal > 0 ? ` (${runsTotal})` : ''}`}
            {tab === 'manifest' && 'Manifest'}
          </button>
        ))}
      </div>

      {/* ── Run History Tab ── */}
      {activeTab === 'runs' && (
        <div className="space-y-3">
          {runsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-400">No runs yet for this test.</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {(['Run ID', t.tests.status, t.tests.duration, t.tests.env, t.tests.trigger, t.tests.date, t.tests.session, ''] as const).map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((run) => (
                      <tr key={run.id} className="cursor-pointer hover:bg-slate-50 group" onClick={() => router.push(`/runs/${run.id}`)}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="text-[11px] font-mono text-blue-600">{run.id.slice(0, 20)}&hellip;</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={run.status} size="xs" /></td>
                        <td className="whitespace-nowrap px-4 py-3"><span className="text-[12px] font-mono font-semibold text-slate-700">{formatDuration(run.duration_ms)}</span></td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {run.environment ?<span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600">{run.environment}</span> : <span className="text-[11px] text-slate-300">-</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3"><span className="text-[11px] text-slate-500 capitalize">{run.trigger || '-'}</span></td>
                        <td className="whitespace-nowrap px-4 py-3"><span className="text-[12px] text-slate-500">{formatDate(run.created_at, localeStr)}</span></td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {run.session_id ? (
                            <span className="text-[11px] text-blue-600 truncate block max-w-[90px]" title={run.session_id}>{run.session_id.slice(0, 12)}&hellip;</span>
                          ) : <span className="text-[11px] text-slate-300">-</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <ChevronRight className="inline h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {runsTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{runsPage * PAGE_SIZE + 1}-{Math.min((runsPage + 1) * PAGE_SIZE, runsTotal)} {t.common.of} {runsTotal}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setRunsPage((p) => Math.max(0, p - 1))} disabled={runsPage === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium text-slate-700">{runsPage + 1} / {runsTotalPages}</span>
                    <button onClick={() => setRunsPage((p) => p + 1)} disabled={(runsPage + 1) * PAGE_SIZE >= runsTotal}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Manifest Tab ── */}
      {activeTab === 'manifest' && (
        <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
          <div className="px-5 py-4">
            <pre className="text-[12px] font-mono text-slate-800 leading-relaxed overflow-auto whitespace-pre-wrap break-all max-h-[600px]">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ── Run With Params Dialog ── */}
      {showParamsDialog && (
        <RunWithParamsDialog
          testId={manifest.id}
          testName={manifest.name}
          defaultParams={manifest.params ?? {}}
          onRun={handleRunWithParams}
          onClose={() => setShowParamsDialog(false)}
        />
      )}
    </div>
  );
}

function MetaItem({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span className="text-slate-400">{label}:</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: typeof BarChart3; label: string; value: string | number; color: string; bg: string;
}) {
  return (
    <div className={cn('rounded-lg border border-slate-200/80 px-4 py-3 shadow-sm', bg)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <p className={cn('mt-1.5 text-xl font-bold tabular-nums', color)}>{value}</p>
    </div>
  );
}
