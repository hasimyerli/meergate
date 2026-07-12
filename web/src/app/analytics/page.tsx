'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchTests, fetchRuns,
  type TestItem, type RunItem,
} from '@/lib/api';
import { formatDuration, exportCSV } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import {
  Target, Timer, TrendingUp, TrendingDown, Activity,
  AlertTriangle, Clock as ClockIcon, Download,
} from 'lucide-react';

const COLORS = {
  passed: '#10b981',
  failed: '#ef4444',
  error: '#f59e0b',
  running: '#3b82f6',
};

const PERIODS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
] as const;

function computeStats(runs: RunItem[]) {
  const finished = runs.filter((r) => ['passed', 'failed', 'error'].includes(r.status));
  const passed = finished.filter((r) => r.status === 'passed').length;
  const failed = finished.filter((r) => r.status === 'failed').length;
  const error = finished.filter((r) => r.status === 'error').length;
  const durations = finished.map((r) => r.duration_ms ?? 0).filter((d) => d > 0);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const passRate = finished.length > 0 ? (passed / finished.length) * 100 : 0;

  const byTest: Record<string, { total: number; passed: number; failed: number; error: number }> = {};
  for (const r of finished) {
    const key = r.test_id ?? 'unknown';
    if (!byTest[key]) byTest[key] = { total: 0, passed: 0, failed: 0, error: 0 };
    byTest[key].total++;
    if (r.status === 'passed') byTest[key].passed++;
    else if (r.status === 'failed') byTest[key].failed++;
    else byTest[key].error++;
  }

  return { totalRuns: runs.length, passRate, avgDuration, passed, failed, error, byTest };
}

function buildDailyTrend(runs: RunItem[], days: number, localeStr: string) {
  const now = Date.now();
  const result: { date: string; passed: number; failed: number; error: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toLocaleDateString(localeStr, { day: '2-digit', month: '2-digit' });
    result.push({ date: key, passed: 0, failed: 0, error: 0 });
  }
  for (const r of runs) {
    const d = new Date(r.created_at);
    const diffDays = Math.floor((now - d.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays < days) {
      const idx = days - 1 - diffDays;
      if (result[idx]) {
        if (r.status === 'passed') result[idx].passed++;
        else if (r.status === 'failed') result[idx].failed++;
        else if (r.status === 'error') result[idx].error++;
      }
    }
  }
  return result;
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const [tests, setTests] = useState<TestItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [testData, runData] = await Promise.all([fetchTests(), fetchRuns({ limit: 1000 })]);
      setTests(testData ?? []);
      setRuns(runData.runs ?? []);
    } catch (err) {
      console.error('Analytics load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredRuns = useMemo(() => {
    const cutoff = Date.now() - period * 86400000;
    return runs.filter((r) => new Date(r.created_at).getTime() > cutoff);
  }, [runs, period]);

  // Previous period runs for comparison
  const prevPeriodRuns = useMemo(() => {
    const cutoffStart = Date.now() - period * 2 * 86400000;
    const cutoffEnd = Date.now() - period * 86400000;
    return runs.filter((r) => {
      const ts = new Date(r.created_at).getTime();
      return ts > cutoffStart && ts <= cutoffEnd;
    });
  }, [runs, period]);

  const stats = useMemo(() => computeStats(filteredRuns), [filteredRuns]);
  const prevStats = useMemo(() => computeStats(prevPeriodRuns), [prevPeriodRuns]);
  const dailyTrend = useMemo(() => buildDailyTrend(runs, period, localeStr), [runs, period, localeStr]);

  // Period comparison deltas
  const passRateDelta = prevPeriodRuns.length > 0 ? stats.passRate - prevStats.passRate : null;
  const totalRunsDelta = prevPeriodRuns.length > 0 ? stats.totalRuns - prevStats.totalRuns : null;
  const avgDurDelta = prevPeriodRuns.length > 0 && prevStats.avgDuration > 0
    ? ((stats.avgDuration - prevStats.avgDuration) / prevStats.avgDuration) * 100
    : null;
  const failedDelta = prevPeriodRuns.length > 0 ? (stats.failed + stats.error) - (prevStats.failed + prevStats.error) : null;

  const donutData = useMemo(() => [
    { name: t.common.passed, value: stats.passed, color: COLORS.passed, status: 'passed' },
    { name: t.common.failed, value: stats.failed, color: COLORS.failed, status: 'failed' },
    { name: t.common.error, value: stats.error, color: COLORS.error, status: 'error' },
  ].filter((d) => d.value > 0), [stats, t]);

  const testBarData = useMemo(() =>
    Object.entries(stats.byTest)
      .map(([id, s]) => ({ name: tests.find((test) => test.id === id)?.name ?? id, passed: s.passed, failed: s.failed + s.error, passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0 }))
      .sort((a, b) => b.passed + b.failed - (a.passed + a.failed))
      .slice(0, 12),
  [stats, tests]);

  const flakyTests = useMemo(() =>
    tests.filter((test) => test.flakeScore != null && test.flakeScore > 0)
      .sort((a, b) => (b.flakeScore ?? 0) - (a.flakeScore ?? 0))
      .slice(0, 10),
  [tests]);

  const slowTests = useMemo(() => {
    const testDurations: Record<string, number[]> = {};
    for (const r of filteredRuns) {
      if (r.duration_ms && r.duration_ms > 0) {
        if (!testDurations[r.test_id]) testDurations[r.test_id] = [];
        testDurations[r.test_id].push(r.duration_ms);
      }
    }
    return Object.entries(testDurations)
      .map(([id, durations]) => ({
        id, name: tests.find((test) => test.id === id)?.name ?? id,
        avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        max: Math.max(...durations), runs: durations.length,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
  }, [filteredRuns, tests]);

  // Drill-down navigation — geçici olarak devre dışı ("şimdilik" tests
  // sayfasına yönlendirme yok). Tekrar açmak için gövdeyi geri getir.
  const navigateToRuns = (_status?: string) => {
    // no-op
  };

  // CSV export
  const handleExport = () => {
    const headers = ['ID', 'Test ID', 'Status', 'Duration (ms)', 'Trigger', 'Environment', 'Created At'];
    const rows = filteredRuns.map((r) => [
      r.id, r.test_id, r.status,
      String(r.duration_ms ?? ''), r.trigger, r.environment ?? '', r.created_at,
    ]);
    exportCSV(headers, rows, `analytics-${period}d-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1,2,3,4].map((i) => <div key={i} className="skeleton h-[100px]" />)}
        </div>
        <div className="skeleton h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.analytics.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{t.analytics.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {t.analytics.exportCSV}
          </button>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriod(p.days)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  period === p.days
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI with period comparison */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={t.analytics.validationRuns}
          value={stats.totalRuns}
          icon={<Activity className="h-5 w-5 text-blue-600" />}
          delta={totalRunsDelta != null ? { value: `${totalRunsDelta >= 0 ? '+' : ''}${totalRunsDelta}`, up: totalRunsDelta >= 0 } : undefined}
          vsPrevPeriod={t.analytics.vsPrevPeriod}
        />
        <KpiCard
          label={t.dashboard.passRate}
          value={`${stats.passRate.toFixed(1)}%`}
          icon={<Target className="h-5 w-5 text-emerald-600" />}
          delta={passRateDelta != null ? { value: `${passRateDelta >= 0 ? '+' : ''}${passRateDelta.toFixed(1)}%`, up: passRateDelta >= 0 } : undefined}
          vsPrevPeriod={t.analytics.vsPrevPeriod}
        />
        <KpiCard
          label={t.analytics.avgDuration}
          value={formatDuration(Math.round(stats.avgDuration))}
          icon={<Timer className="h-5 w-5 text-amber-600" />}
          delta={avgDurDelta != null ? { value: `${avgDurDelta >= 0 ? '+' : ''}${avgDurDelta.toFixed(0)}%`, up: avgDurDelta <= 0 } : undefined}
          vsPrevPeriod={t.analytics.vsPrevPeriod}
        />
        <KpiCard
          label={t.analytics.failedRuns}
          value={stats.failed + stats.error}
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          delta={failedDelta != null ? { value: `${failedDelta >= 0 ? '+' : ''}${failedDelta}`, up: failedDelta <= 0 } : undefined}
          vsPrevPeriod={t.analytics.vsPrevPeriod}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Donut - clickable segments */}
        <div className="lg:col-span-3 card p-5">
          <p className="text-sm font-semibold text-slate-900">{t.analytics.runOutcomeDistribution}</p>
          <p className="text-xs text-slate-400 mb-4">{t.analytics.lastNDays.replace('{days}', String(period))}</p>
          <div className="relative mx-auto" style={{ width: 150, height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%" cy="50%"
                  innerRadius={48} outerRadius={70}
                  paddingAngle={3} dataKey="value" stroke="none"
                >
                  {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-slate-900 tabular-nums">{stats.passRate.toFixed(0)}%</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t.analytics.pass}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[
              { color: COLORS.passed, label: t.common.passed, value: stats.passed, status: 'passed' },
              { color: COLORS.failed, label: t.common.failed, value: stats.failed, status: 'failed' },
              { color: COLORS.error, label: t.common.error, value: stats.error, status: 'error' },
            ].map((item) => (
              <button
                key={item.status}
                onClick={() => navigateToRuns(item.status)}
                className="flex w-full items-center justify-between hover:bg-slate-50 rounded px-1 py-0.5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-slate-500">{item.label}</span>
                </div>
                <span className="text-xs font-semibold text-slate-900 tabular-nums">{item.value}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Trend */}
        <div className="lg:col-span-9 card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{t.analytics.passFailTrend}</p>
              <p className="text-xs text-slate-400">{t.analytics.dailyDistribution.replace('{days}', String(period))}</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t.common.passed}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />{t.common.failed}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />{t.common.error}</span>
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.passed} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.passed} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.failed} stopOpacity={0.1} />
                    <stop offset="95%" stopColor={COLORS.failed} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)' }} />
                <Area type="monotone" dataKey="passed" stroke={COLORS.passed} fill="url(#gP)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="failed" stroke={COLORS.failed} fill="url(#gF)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="error" stroke={COLORS.error} fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Test Performance - top tests by run volume */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-900">{t.analytics.suitePerformance}</p>
        <p className="text-xs text-slate-400 mb-4">{t.analytics.suiteHint}</p>
        {testBarData.length > 0 ? (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={testBarData}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="passed" fill={COLORS.passed} radius={[4, 4, 0, 0]} name={t.common.passed} />
                <Bar dataKey="failed" fill={COLORS.failed} radius={[4, 4, 0, 0]} name={t.common.failed} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center py-16">
            <p className="text-xs text-slate-400">{t.analytics.noDataPeriod}</p>
          </div>
        )}
      </div>

      {/* Flaky + Slow */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DataTable
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          title={t.analytics.flakyTests}
          empty={t.analytics.noFlakyTests}
          headers={[t.common.test, t.analytics.flakeScore]}
          rows={flakyTests.map((test) => ({
            key: test.id,
            cells: [
              <div key="n"><div className="text-xs font-medium text-slate-800 truncate max-w-[250px]">{test.name}</div><div className="text-[10px] text-slate-400 font-mono">{test.id}</div></div>,
              <span key="s" className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                (test.flakeScore ?? 0) > 60 ? 'bg-red-100 text-red-700' : (test.flakeScore ?? 0) > 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}>{test.flakeScore?.toFixed(0)}</span>,
            ],
          }))}
        />
        <DataTable
          icon={<ClockIcon className="h-4 w-4 text-amber-500" />}
          title={t.analytics.slowestTests}
          empty={t.analytics.noDurationData}
          headers={[t.common.test, t.analytics.avg, t.analytics.max]}
          rows={slowTests.map((test) => ({
            key: test.id,
            cells: [
              <div key="n"><div className="text-xs font-medium text-slate-800 truncate max-w-[220px]">{test.name}</div><div className="text-[10px] text-slate-400">{test.runs} runs</div></div>,
              <span key="a" className="text-xs font-mono font-semibold text-slate-700">{formatDuration(test.avg)}</span>,
              <span key="m" className="text-xs font-mono text-slate-500">{formatDuration(test.max)}</span>,
            ],
          }))}
        />
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, delta, vsPrevPeriod, onClick }: {
  label: string; value: string | number; icon: React.ReactNode;
  delta?: { value: string; up: boolean };
  vsPrevPeriod: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`card p-5 card-hover ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className="rounded-lg bg-slate-50 p-2">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
      {delta && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${delta.up ? 'text-emerald-600' : 'text-red-500'}`}>
          {delta.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta.value} {vsPrevPeriod}
        </div>
      )}
    </div>
  );
}

function DataTable({ icon, title, empty, headers, rows }: {
  icon: React.ReactNode; title: string; empty: string;
  headers: string[];
  rows: { key: string; cells: React.ReactNode[]; onClick?: () => void }[];
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
        {icon}
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-xs text-slate-400">{empty}</p>
      ) : (
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-100">
              {headers.map((h, i) => (
                <th key={h} className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => (
              <tr
                key={row.key}
                className={`hover:bg-slate-50/50 ${row.onClick ? 'cursor-pointer' : ''}`}
                onClick={row.onClick}
              >
                {row.cells.map((cell, i) => (
                  <td key={i} className={`px-5 py-2.5 ${i === 0 ? '' : 'text-right'}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
