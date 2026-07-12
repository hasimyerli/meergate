'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchTests, runSingleTest, runBatch, reloadTests, fetchRuns,
  fetchSessions, deleteRunApi, deleteTestApi, fetchCoverage, fetchCatalog,
  type TestItem, type RunItem, type RunContext, type SessionItem,
  type CoverageReport, type CatalogEntry,
} from '@/lib/api';
import { testServiceMap } from '@/lib/gate-status';
import { StatusBadge } from './status-badge';
import { RunWithParamsDialog } from './run-with-params-dialog';
import { CreateHub } from './create-hub';
import { SectionTabs } from './section-tabs';
import { formatDate, formatDuration, cn } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import {
  RefreshCw, Search, ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronRight, ChevronLeft, Server, Globe, Radio, Loader2, Play,
  SlidersHorizontal, ExternalLink, Trash2, X,
  Plus,
} from 'lucide-react';

/** How many tests to render per service group before "show more" (keeps the
 *  DOM bounded even with hundreds of tests). */
const GROUP_PAGE_SIZE = 25;

const GENERIC_TAGS = new Set([
  'smoke', 'regression', 'grpc', 'ws', 'rest', 'e2e', 'integration', 'unit',
]);

const ENDPOINT_DOT: Record<string, string> = {
  rest: 'bg-blue-500', api: 'bg-sky-500', grpc: 'bg-violet-500',
  ws: 'bg-emerald-500', browser: 'bg-amber-500',
};

const ENDPOINT_ICONS: Record<string, typeof Server> = {
  rest: Globe, api: Globe, grpc: Server,
  ws: Radio, browser: Server,
};

const STATUS_OPTIONS = ['', 'passed', 'failed', 'error', 'running', 'pending'] as const;
const TRIGGER_OPTIONS = ['', 'manual', 'scheduled', 'ci', 'webhook'] as const;
const PAGE_SIZES = [20, 50, 100] as const;

type SortField = 'name' | 'endpoint' | 'status' | 'lastRun' | 'passRate' | 'flakeScore' | 'owner';
type SortDir = 'asc' | 'desc';
type PageTab = 'tests' | 'runs';

function deriveEndpoint(test: TestItem): string {
  const domainTags = test.tags.filter((tag) => !GENERIC_TAGS.has(tag));
  if (domainTags.length > 0) return domainTags.find((tag) => tag.includes('-')) ?? domainTags[0]!;
  return test.tags[0] ?? 'general';
}

function endpointLabel(key: string) {
  return key.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function TestList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as PageTab) || 'tests';
  const initialTestId = searchParams.get('test_id') ?? '';
  const VALUE_FILTER_KEYS = ['all', 'failing', 'passing', 'generated', 'manual', 'critical', 'flaky'] as const;
  type ValueFilter = (typeof VALUE_FILTER_KEYS)[number];
  const filterParam = searchParams.get('filter');
  const initialValueFilter: ValueFilter = (VALUE_FILTER_KEYS as readonly string[]).includes(filterParam ?? '') ? (filterParam as ValueFilter) : 'all';
  const { t } = useI18n();
  const localeStr = useLocaleString();

  const [pageTab, setPageTab] = useState<PageTab>(initialTab);

  // Keep the active tab in sync with the URL so the shared SectionTabs links
  // (Tests ↔ Runs) switch the view without a full remount.
  useEffect(() => {
    setPageTab((searchParams.get('tab') as PageTab) || 'tests');
  }, [searchParams]);

  const [tests, setTests] = useState<TestItem[]>([]);
  const [gateCoverage, setGateCoverage] = useState<CoverageReport | null>(null);
  const [gateCatalog, setGateCatalog] = useState<CatalogEntry[]>([]);
  const [collapsedSvc, setCollapsedSvc] = useState<Set<string>>(new Set());
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [valueFilter, setValueFilter] = useState<ValueFilter>(initialValueFilter);
  const [sortField, setSortField] = useState<SortField>('endpoint');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [dialogTest, setDialogTest] = useState<TestItem | null>(null);
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [allRuns, setAllRuns] = useState<RunItem[]>([]);
  const [allRunsTotal, setAllRunsTotal] = useState(0);
  const [allRunsLoading, setAllRunsLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [rStatusFilter, setRStatusFilter] = useState(searchParams.get('status') ?? '');
  const [rTestFilter, setRTestFilter] = useState(initialTestId);
  const [rSessionFilter, setRSessionFilter] = useState('');
  const [rEnvFilter, setREnvFilter] = useState('');
  const [rTriggerFilter, setRTriggerFilter] = useState('');
  const [rPage, setRPage] = useState(0);
  const [rPageSize, setRPageSize] = useState<number>(20);

  const loadTests = useCallback(async () => {
    setLoading(true);
    try { setTests(await fetchTests()); }
    catch (err) { console.error('Failed to fetch tests:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTests(); }, [loadTests]);

  useEffect(() => {
    fetchSessions({ limit: 100 }).then((d) => setSessions(d.sessions ?? [])).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (runningTests.size === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      const fresh = await fetchTests();
      setTests(fresh);
      const stillRunning = new Set<string>();
      for (const id of runningTests) {
        const item = fresh.find((f) => f.id === id);
        if (item && (!item.lastRunStatus || item.lastRunStatus === 'running' || item.lastRunStatus === 'pending')) {
          stillRunning.add(id);
        }
      }
      setRunningTests(stillRunning);
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runningTests]);

  const enriched = useMemo(() =>
    tests.map((item) => ({ ...item, endpoint: deriveEndpoint(item) })),
  [tests]);

  // Best-effort service assignment for each test (real link via coverage map).
  useEffect(() => {
    fetchCoverage().then(setGateCoverage).catch(() => setGateCoverage(null));
    fetchCatalog().then(setGateCatalog).catch(() => setGateCatalog([]));
  }, []);
  const serviceForTest = useMemo(() => {
    const map = testServiceMap(gateCoverage);
    const names = new Map(gateCatalog.map((c) => [c.id, c.name || c.id]));
    return (testId: string): string | null => {
      const sid = map.get(testId);
      return sid ? (names.get(sid) ?? sid) : null;
    };
  }, [gateCoverage, gateCatalog]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((item) =>
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.endpoint.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (valueFilter !== 'all') {
      list = list.filter((item) => {
        const failing = item.lastRunStatus === 'failed' || item.lastRunStatus === 'error';
        switch (valueFilter) {
          case 'failing': return failing;
          case 'passing': return item.lastRunStatus === 'passed';
          case 'critical': return item.tags.includes('critical');
          case 'flaky': return (item.flakeScore ?? 0) > 30;
          case 'generated': return item.tags.includes('generated');
          case 'manual': return !item.tags.includes('generated');
          default: return true;
        }
      });
    }
    return list;
  }, [enriched, search, valueFilter]);

  const sorted = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':       cmp = a.name.localeCompare(b.name); break;
        case 'endpoint':   cmp = a.endpoint.localeCompare(b.endpoint) || a.name.localeCompare(b.name); break;
        case 'status':     cmp = (a.lastRunStatus ?? '').localeCompare(b.lastRunStatus ?? ''); break;
        case 'lastRun':    cmp = (a.lastRunAt ?? '').localeCompare(b.lastRunAt ?? ''); break;
        case 'passRate':   cmp = (a.passRate ?? -1) - (b.passRate ?? -1); break;
        case 'flakeScore': cmp = (a.flakeScore ?? -1) - (b.flakeScore ?? -1); break;
        case 'owner':      cmp = (a.owner ?? '').localeCompare(b.owner ?? ''); break;
      }
      return cmp * mul;
    });
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const handleRun = async (testId: string) => {
    setRunningTests((prev) => new Set(prev).add(testId));
    await runSingleTest(testId, 'real');
    setTimeout(loadTests, 800);
  };

  const handleRunWithParams = async (mode: string, overrides: Record<string, string>, context?: RunContext, sessionId?: string) => {
    if (!dialogTest) return;
    setRunningTests((prev) => new Set(prev).add(dialogTest.id));
    await runSingleTest(dialogTest.id, mode, overrides, context, sessionId);
    setTimeout(loadTests, 800);
  };

  const handleRunAll = async () => {
    await runBatch({});
    setRunningTests(new Set(tests.map((item) => item.id)));
    setTimeout(loadTests, 1500);
  };

  const handleDeleteTest = async (id: string, name: string) => {
    if (!confirm(`"${name}" ${t.tests.deleteTestConfirm}`)) return;
    try { await deleteTestApi(id); await loadTests(); } catch (err) { console.error(err); }
  };

  const rEnvironments = useMemo(() => {
    const envs = new Set<string>();
    allRuns.forEach((r) => { if (r.environment) envs.add(r.environment); });
    return [...envs].sort();
  }, [allRuns]);

  const loadAllRuns = useCallback(async () => {
    setAllRunsLoading(true);
    try {
      const data = await fetchRuns({
        status: rStatusFilter || undefined,
        test_id: rTestFilter || undefined,
        session_id: rSessionFilter || undefined,
        environment: rEnvFilter || undefined,
        trigger: rTriggerFilter || undefined,
        limit: rPageSize,
        offset: rPage * rPageSize,
      });
      setAllRuns(data.runs ?? []);
      setAllRunsTotal(data.total ?? 0);
    } catch (err) {
      console.error('Failed to fetch runs:', err);
    } finally {
      setAllRunsLoading(false);
    }
  }, [rStatusFilter, rTestFilter, rSessionFilter, rEnvFilter, rTriggerFilter, rPage, rPageSize]);

  useEffect(() => {
    if (pageTab === 'runs') loadAllRuns();
  }, [pageTab, loadAllRuns]);

  const rTotalPages = Math.ceil(allRunsTotal / rPageSize);
  const rHasFilters = rStatusFilter || rTestFilter || rSessionFilter || rEnvFilter || rTriggerFilter;
  const rClearFilters = () => { setRStatusFilter(''); setRTestFilter(''); setRSessionFilter(''); setREnvFilter(''); setRTriggerFilter(''); setRPage(0); };

  const handleDeleteRun = async (id: string) => {
    if (!confirm(t.tests.deleteRunConfirm)) return;
    try { await deleteRunApi(id); await loadAllRuns(); } catch (err) { console.error(err); }
  };

  const passedCount = tests.filter((item) => item.lastRunStatus === 'passed').length;
  const failedCount = tests.filter((item) => item.lastRunStatus === 'failed').length;
  // Group the (filtered, sorted) tests by the service they protect. Tests not
  // covering any catalog operation fall into an "Unassigned service" group.
  const testGroups = useMemo(() => {
    const unassigned = t.overview.unassignedService;
    const m = new Map<string, typeof sorted>();
    for (const test of sorted) {
      const svc = serviceForTest(test.id) ?? unassigned;
      const a = m.get(svc) ?? []; a.push(test); m.set(svc, a);
    }
    return Array.from(m.entries())
      .sort((a, b) => (a[0] === unassigned ? 1 : b[0] === unassigned ? -1 : a[0].localeCompare(b[0])))
      .map(([service, items]) => ({ service, items }));
  }, [sorted, serviceForTest, t.overview.unassignedService]);
  const toggleSvc = (s: string) => setCollapsedSvc((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  const renderTestRow = (test: typeof sorted[number]) => {
    const Icon = ENDPOINT_ICONS[test.endpoint] ?? Server;
    const dot = ENDPOINT_DOT[test.endpoint] ?? 'bg-slate-400';
    const isRunning = runningTests.has(test.id);
    return (
      <tr key={test.id}
        className={cn('cursor-pointer group', isRunning ? 'bg-blue-50/30' : 'hover:bg-slate-50')}
        onClick={() => router.push(`/tests/${encodeURIComponent(test.id)}`)}
      >
        <td className="whitespace-nowrap px-4 py-3 pl-8">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full shrink-0', dot)} />
            <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-[12px] font-semibold text-slate-700">{endpointLabel(test.endpoint)}</span>
          </div>
        </td>
        <td className="px-4 py-3 max-w-[320px]">
          <div className="text-[13px] font-medium text-slate-900 truncate">{test.name}</div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400 truncate">{test.id}</div>
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {isRunning ? <StatusBadge status="running" size="xs" /> : test.lastRunStatus ? <StatusBadge status={test.lastRunStatus} size="xs" /> : <span className="text-[11px] text-slate-300">&ndash;</span>}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {test.passRate != null ? <span className={cn('text-[12px] font-bold tabular-nums', test.passRate >= 90 ? 'text-emerald-600' : test.passRate >= 70 ? 'text-amber-600' : 'text-red-600')}>{test.passRate.toFixed(0)}%</span> : <span className="text-slate-300 text-[11px]">&ndash;</span>}
        </td>
        <td className="whitespace-nowrap px-4 py-3"><span className="text-[11px] text-slate-500">{test.lastRunAt ? formatDate(test.lastRunAt, localeStr) : '–'}</span></td>
        <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => handleRun(test.id)} className="flex h-7 items-center gap-1 rounded-lg bg-blue-600 px-2 text-[11px] font-semibold text-white hover:bg-blue-700 shadow-sm"><Play className="h-3 w-3" />{t.common.run}</button>
            <button onClick={() => setDialogTest(test)} className="flex h-7 items-center rounded-lg bg-white px-2 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" title={t.runParams.title}><SlidersHorizontal className="h-3 w-3" /></button>
            <Link href={`/builder?load=${test.id}`} className="flex h-7 items-center rounded-lg bg-white px-2 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" title={t.nav.builder}><ExternalLink className="h-3 w-3" /></Link>
            <button onClick={() => handleDeleteTest(test.id, test.name)} className="flex h-7 items-center rounded-lg bg-white px-2 text-[11px] font-medium text-slate-400 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 transition-colors" title={t.common.delete}><Trash2 className="h-3 w-3" /></button>
          </div>
        </td>
      </tr>
    );
  };

  const hasTestFilters = search.length > 0 || valueFilter !== 'all';
  const VALUE_FILTERS: { key: typeof valueFilter; label: string }[] = [
    { key: 'all', label: t.tests.filterAll },
    { key: 'failing', label: t.tests.filterFailing },
    { key: 'passing', label: t.tests.filterPassing },
    { key: 'generated', label: t.tests.filterGenerated },
    { key: 'manual', label: t.tests.filterManual },
    { key: 'critical', label: t.tests.filterCritical },
    { key: 'flaky', label: t.tests.filterFlaky },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.tests.testSuites}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
            <span>{tests.length} test</span>
            {passedCount > 0 && <><span className="text-slate-300">&middot;</span><span className="text-emerald-600 font-medium">{passedCount} {t.common.passed}</span></>}
            {failedCount > 0 && <><span className="text-slate-300">&middot;</span><span className="text-red-600 font-medium">{failedCount} {t.common.failed}</span></>}
            {runningTests.size > 0 && (
              <><span className="text-slate-300">&middot;</span>
              <span className="flex items-center gap-1 text-blue-600 font-medium">
                <Loader2 className="h-3 w-3 animate-spin" />{runningTests.size} running
              </span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pageTab === 'tests' && (
            <>
              <button onClick={async () => { await reloadTests(); await loadTests(); }}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                <RefreshCw className="h-3.5 w-3.5" />{t.tests.reload}
              </button>
              <button onClick={handleRunAll}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                <Play className="h-3.5 w-3.5" />{t.tests.runAll}
              </button>
              <Link href="/builder"
                className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white shadow-sm hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" />{t.nav.newTest}
              </Link>
            </>
          )}
          {pageTab === 'runs' && (
            <button onClick={loadAllRuns}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <SectionTabs active={pageTab} runsBadge={allRunsTotal} />

      {/* ── TESTS TAB ── */}
      {pageTab === 'tests' && (
        !loading && tests.length === 0 ? (
          <div className="py-10">
            <CreateHub />
          </div>
        ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder={t.tests.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none" />
            </div>
            {hasTestFilters && (
              <button onClick={() => { setSearch(''); setValueFilter('all'); }}
                className="text-[12px] text-slate-400 hover:text-slate-700 underline underline-offset-2">{t.common.clear}</button>
            )}
            <span className="ml-auto text-[11px] text-slate-400">{filtered.length} / {tests.length} {t.common.shown}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {VALUE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setValueFilter(f.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                  valueFilter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {f.label}
              </button>
            ))}
            {testGroups.length > 1 && (
              <div className="ml-auto flex items-center gap-3">
                <button onClick={() => setCollapsedSvc(new Set(testGroups.map((g) => g.service)))} className="text-[12px] text-slate-400 hover:text-slate-700">{t.tests.collapseAll}</button>
                <button onClick={() => setCollapsedSvc(new Set())} className="text-[12px] text-slate-400 hover:text-slate-700">{t.tests.expandAll}</button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <SortTh field="endpoint" label={t.tests.endpoint} current={sortField} dir={sortDir} onClick={toggleSort} />
                  <SortTh field="name" label={t.tests.test} current={sortField} dir={sortDir} onClick={toggleSort} />
                  <SortTh field="status" label={t.tests.status} current={sortField} dir={sortDir} onClick={toggleSort} />
                  <SortTh field="passRate" label={t.tests.passPercent} current={sortField} dir={sortDir} onClick={toggleSort} />
                  <SortTh field="lastRun" label={t.tests.lastRun} current={sortField} dir={sortDir} onClick={toggleSort} />
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                    {tests.length === 0 ? t.tests.noTestsFound : t.tests.noMatchingTests}
                  </td></tr>
                ) : testGroups.map((grp) => {
                  const isCol = collapsedSvc.has(grp.service);
                  const failing = grp.items.filter((x) => x.lastRunStatus === 'failed' || x.lastRunStatus === 'error').length;
                  return (
                    <Fragment key={grp.service}>
                      <tr className="cursor-pointer border-b border-slate-100 bg-violet-50/40 hover:bg-violet-50/70" onClick={() => toggleSvc(grp.service)}>
                        <td colSpan={6} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {isCol ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                            <span className="text-[13px] font-semibold text-violet-700">{grp.service}</span>
                            <span className="text-[11px] text-slate-400">{grp.items.length} {t.common.tests}</span>
                            {failing > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">{failing} {t.common.failed}</span>}
                          </div>
                        </td>
                      </tr>
                      {!isCol && (() => {
                        const limit = groupLimits[grp.service] ?? GROUP_PAGE_SIZE;
                        const shown = grp.items.slice(0, limit);
                        const remaining = grp.items.length - shown.length;
                        return (
                          <>
                            {shown.map(renderTestRow)}
                            {remaining > 0 && (
                              <tr className="bg-slate-50/40">
                                <td colSpan={6} className="px-4 py-2 pl-8">
                                  <button
                                    onClick={() => setGroupLimits((p) => ({ ...p, [grp.service]: (p[grp.service] ?? GROUP_PAGE_SIZE) + GROUP_PAGE_SIZE }))}
                                    className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700"
                                  >
                                    {t.tests.showMore.replace('{count}', String(Math.min(remaining, GROUP_PAGE_SIZE)))}
                                  </button>
                                  <button
                                    onClick={() => setGroupLimits((p) => ({ ...p, [grp.service]: grp.items.length }))}
                                    className="ml-3 text-[12px] text-slate-400 hover:text-slate-600"
                                  >
                                    {t.tests.showAll}
                                  </button>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
        )
      )}

      {/* ── ALL RUNS TAB ── */}
      {pageTab === 'runs' && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t.tests.statusFilter}</span>
            <div className="flex items-center gap-1">
              {STATUS_OPTIONS.map((s) => (
                <button key={s || 'all'} onClick={() => { setRStatusFilter(s); setRPage(0); }}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold capitalize transition-all ${
                    rStatusFilter === s ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-700'
                  }`}>{s || t.common.all}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 px-4 py-3">
            <div className="flex-1 min-w-[180px] max-w-xs">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.tests.test}</label>
              <select value={rTestFilter} onChange={(e) => { setRTestFilter(e.target.value); setRPage(0); }}
                className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 focus:outline-none">
                <option value="">{t.tests.allTests}</option>
                {tests.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
              </select>
            </div>
            <div className="min-w-[160px]">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.tests.session}</label>
              <select value={rSessionFilter} onChange={(e) => { setRSessionFilter(e.target.value); setRPage(0); }}
                className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 focus:outline-none">
                <option value="">{t.tests.allSessions}</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="min-w-[120px]">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.tests.env}</label>
              <select value={rEnvFilter} onChange={(e) => { setREnvFilter(e.target.value); setRPage(0); }}
                className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 focus:outline-none">
                <option value="">{t.tests.allEnvs}</option>
                {rEnvironments.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="min-w-[120px]">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.tests.trigger}</label>
              <select value={rTriggerFilter} onChange={(e) => { setRTriggerFilter(e.target.value); setRPage(0); }}
                className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 capitalize focus:border-blue-400 focus:ring-1 focus:ring-blue-100 focus:outline-none">
                <option value="">{t.tests.allTriggers}</option>
                {TRIGGER_OPTIONS.slice(1).map((trigger) => <option key={trigger} value={trigger}>{trigger}</option>)}
              </select>
            </div>
            {rHasFilters && (
              <div className="self-end">
                <button onClick={rClearFilters} className="flex h-8 items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700"><X className="h-3 w-3" /> {t.common.clear}</button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
            {allRunsLoading ? (
              <div className="flex items-center justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.test}</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.status}</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.duration}</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.env}</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.trigger}</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.date}</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.session}</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => router.push(`/runs/${encodeURIComponent(run.id)}`)}>
                      <td className="px-5 py-3">
                        <span className="text-[13px] font-medium text-blue-600">{run.test_id}</span>
                        <p className="mt-0.5 text-[10px] font-mono text-slate-400">{run.id}</p>
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={run.status} size="xs" /></td>
                      <td className="px-5 py-3"><span className="text-[12px] font-mono font-semibold text-slate-700">{formatDuration(run.duration_ms)}</span></td>
                      <td className="px-5 py-3">
                        {run.environment ? <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600">{run.environment}</span> : <span className="text-[11px] text-slate-300">-</span>}
                      </td>
                      <td className="px-5 py-3"><span className="text-[11px] text-slate-500 capitalize">{run.trigger || '-'}</span></td>
                      <td className="px-5 py-3"><span className="text-[12px] text-slate-500">{formatDate(run.created_at, localeStr)}</span></td>
                      <td className="px-5 py-3">
                        {run.session_id ? <span className="text-[11px] text-blue-600 truncate block max-w-[100px]">{run.session_id.slice(0, 12)}...</span> : <span className="text-[11px] text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleDeleteRun(run.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all" title={t.common.delete}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {allRuns.length === 0 && (
                    <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-400">{t.tests.noRunsFound}</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {allRunsTotal > rPageSize && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">{rPage * rPageSize + 1}-{Math.min((rPage + 1) * rPageSize, allRunsTotal)} {t.common.of} {allRunsTotal}</span>
                <select value={rPageSize} onChange={(e) => { setRPageSize(Number(e.target.value)); setRPage(0); }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-600 focus:outline-none">
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} {t.common.perPage}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setRPage((p) => Math.max(0, p - 1))} disabled={rPage === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-slate-700">{rPage + 1} / {rTotalPages}</span>
                <button onClick={() => setRPage((p) => p + 1)} disabled={(rPage + 1) * rPageSize >= allRunsTotal}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {dialogTest && (
        <RunWithParamsDialog
          testId={dialogTest.id} testName={dialogTest.name} defaultParams={dialogTest.params ?? {}}
          onRun={handleRunWithParams} onClose={() => setDialogTest(null)}
        />
      )}
    </div>
  );
}

function SortTh({ field, label, current, dir, onClick }: {
  field: SortField; label: string; current: SortField; dir: SortDir; onClick: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700" onClick={() => onClick(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? dir === 'asc' ? <ChevronUp className="h-3 w-3 text-blue-500" /> : <ChevronDown className="h-3 w-3 text-blue-500" /> : <ChevronsUpDown className="h-3 w-3 opacity-25" />}
      </span>
    </th>
  );
}
