'use client';

import { useState, useEffect, useCallback, use, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchSessionDetail, fetchTests, runSingleTest,
  type SessionDetail, type TestItem,
} from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDuration, formatDate } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import {
  ArrowLeft, RefreshCw, GitBranch, Globe, Tag, User, ExternalLink,
  Plus, Search, Play, Loader2, X, Check, ChevronDown, ChevronRight,
} from 'lucide-react';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const { id } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRunPanel, setShowRunPanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSession(await fetchSessionDetail(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.sessions.failedToLoad);
    } finally {
      setLoading(false);
    }
  }, [id, t.sessions.failedToLoad]);

  const hasAnyRunning = (session?.runs ?? []).some((r) => r.status === 'running' || r.status === 'pending');

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!hasAnyRunning) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [hasAnyRunning, load]);

  if (loading && !session) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/sessions" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          {t.sessions.backToSessions}
        </Link>
      </div>
    );
  }

  if (!session) return null;

  const sum = session.summary;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.nav.sessions}
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-[13px] font-medium text-slate-600 truncate max-w-[300px]">{session.label}</span>
      </div>

      {/* Session Card */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{session.label}</h1>
            <p className="mt-0.5 text-[11px] font-mono text-slate-400">{session.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
              title={t.common.refresh}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowRunPanel(!showRunPanel)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.sessions.runTest}
            </button>
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-0 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
          {session.environment && (
            <MetaCell label={t.sessions.environment}>
              <span className="inline-flex items-center gap-1 text-[12px] text-slate-700">
                <Globe className="h-3 w-3 text-slate-400" />{session.environment}
              </span>
            </MetaCell>
          )}
          {session.git_ref && (
            <MetaCell label={t.sessions.gitRef}>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-700">
                <GitBranch className="h-3 w-3 text-slate-400" />
                {session.git_ref}
                {session.git_commit && <span className="text-slate-400">@{session.git_commit.slice(0, 7)}</span>}
              </span>
            </MetaCell>
          )}
          {session.jira_ref && (
            <MetaCell label={t.sessions.jira}>
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
                <Tag className="h-2.5 w-2.5" />{session.jira_ref}
              </span>
            </MetaCell>
          )}
          {session.created_by && (
            <MetaCell label={t.sessions.createdBy}>
              <span className="inline-flex items-center gap-1 text-[12px] text-slate-700">
                <User className="h-3 w-3 text-slate-400" />{session.created_by}
              </span>
            </MetaCell>
          )}
          <MetaCell label={t.sessions.created}>
            <span className="text-[12px] text-slate-700">{formatDate(session.created_at, localeStr)}</span>
          </MetaCell>
          {session.run_tags && session.run_tags.length > 0 && (
            <MetaCell label={t.sessions.tags}>
              <div className="flex flex-wrap gap-1">
                {session.run_tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-semibold text-slate-600">{tag}</span>
                ))}
              </div>
            </MetaCell>
          )}
        </div>

        {/* Summary bar */}
        {sum && sum.total > 0 && (
          <div className="flex items-center gap-4 bg-slate-50/50 px-5 py-2.5">
            <span className="text-[12px] font-semibold text-slate-700">{sum.total} {t.common.runs}</span>
            <div className="flex items-center gap-2">
              {sum.passed > 0 && <StatusBadge status="passed" size="xs" label={`${sum.passed} ${t.common.passed}`} />}
              {sum.failed > 0 && <StatusBadge status="failed" size="xs" label={`${sum.failed} ${t.common.failed}`} />}
              {sum.error > 0 && <StatusBadge status="error" size="xs" label={`${sum.error} ${t.common.error}`} />}
              {sum.running > 0 && <StatusBadge status="running" size="xs" label={`${sum.running} ${t.common.running}`} />}
              {sum.pending > 0 && <StatusBadge status="pending" size="xs" label={`${sum.pending} ${t.common.pending}`} />}
            </div>
            <span className="ml-auto text-[11px] font-mono font-semibold text-slate-500">{formatDuration(sum.duration_ms)}</span>
          </div>
        )}
      </div>

      {/* Run test in session panel */}
      {showRunPanel && (
        <RunInSessionPanel
          sessionId={id}
          onClose={() => setShowRunPanel(false)}
          onRanTest={() => { setShowRunPanel(false); setTimeout(load, 800); }}
        />
      )}

      {/* Grouped runs by test */}
      <GroupedRunsTable runs={session.runs} />
    </div>
  );
}

interface RunRow {
  id: string;
  test_id: string;
  status: string;
  mode: string;
  label: string | null;
  duration_ms: number | null;
  started_at: string | null;
  error: string | null;
}

interface TestGroup {
  testId: string;
  runs: RunRow[];
  passed: number;
  failed: number;
  error: number;
  latest: RunRow;
}

function GroupedRunsTable({ runs }: { runs: RunRow[] }) {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups: TestGroup[] = useMemo(() => {
    const map = new Map<string, RunRow[]>();
    for (const run of runs) {
      const list = map.get(run.test_id) ?? [];
      list.push(run);
      map.set(run.test_id, list);
    }
    return Array.from(map.entries()).map(([testId, testRuns]) => {
      const sorted = [...testRuns].sort((a, b) =>
        (b.started_at ?? '').localeCompare(a.started_at ?? ''),
      );
      return {
        testId,
        runs: sorted,
        passed: sorted.filter((r) => r.status === 'passed').length,
        failed: sorted.filter((r) => r.status === 'failed').length,
        error: sorted.filter((r) => r.status === 'error').length,
        latest: sorted[0]!,
      };
    });
  }, [runs]);

  const toggle = (testId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId); else next.add(testId);
      return next;
    });
  };

  if (runs.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.runsInSession}</h2>
        </div>
        <div className="py-12 text-center text-sm text-slate-400">
          {t.sessions.noRunsInSession}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.runsInSession}</h2>
        <span className="text-[10px] text-slate-400">{groups.length} test{groups.length !== 1 ? 's' : ''}, {runs.length} run{runs.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="divide-y divide-slate-100">
        {groups.map((group) => {
          const isOpen = expanded.has(group.testId);
          const hasMultiple = group.runs.length > 1;
          return (
            <div key={group.testId}>
              {/* Group header */}
              <button
                onClick={() => toggle(group.testId)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="text-slate-400">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-slate-800">{group.testId}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {group.passed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {group.passed} {t.common.passed}
                    </span>
                  )}
                  {group.failed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      {group.failed} {t.common.failed}
                    </span>
                  )}
                  {group.error > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      {group.error} {t.common.error}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 tabular-nums w-14 text-right">
                    {group.runs.length} run{group.runs.length !== 1 ? 's' : ''}
                  </span>
                  <StatusBadge status={group.latest.status} size="xs" />
                </div>
              </button>

              {/* Expanded runs */}
              {isOpen && (
                <div className="border-t border-slate-100 bg-blue-50/20">
                  <table className="min-w-full">
                    {hasMultiple && (
                      <thead>
                        <tr>
                          <th className="pl-12 pr-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.common.run}</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.status}</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.duration}</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.date}</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.common.error}</th>
                          <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400" />
                        </tr>
                      </thead>
                    )}
                    <tbody className="divide-y divide-slate-100/60">
                      {group.runs.map((run, idx) => (
                        <tr key={run.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="pl-12 pr-4 py-2.5">
                            <div className="text-[11px] font-mono text-slate-500">#{group.runs.length - idx}</div>
                            <div className="text-[10px] font-mono text-slate-300 truncate max-w-[140px]">{run.id}</div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <StatusBadge status={run.status} size="xs" />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <span className="text-[12px] font-mono font-semibold text-slate-700">{formatDuration(run.duration_ms)}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <span className="text-[12px] text-slate-500">{formatDate(run.started_at, localeStr)}</span>
                          </td>
                          <td className="max-w-[180px] px-4 py-2.5">
                            {run.error ? (
                              <span className="text-[11px] text-red-600 truncate block">{run.error}</span>
                            ) : (
                              <span className="text-[11px] text-slate-300">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <Link
                              href={`/runs/${run.id}`}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              {t.common.detail} <ExternalLink className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <div className="text-[13px] text-slate-700">{children}</div>
    </div>
  );
}

function RunInSessionPanel({
  sessionId,
  onClose,
  onRanTest,
}: {
  sessionId: string;
  onClose: () => void;
  onRanTest: () => void;
}) {
  const { t } = useI18n();
  const [tests, setTests] = useState<TestItem[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const mode = 'real';
  const [running, setRunning] = useState(false);
  const [ranTests, setRanTests] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTests()
      .then(setTests)
      .catch(() => setTests([]))
      .finally(() => setTestsLoading(false));
  }, []);

  const filtered = tests.filter((test) =>
    !search || test.id.toLowerCase().includes(search.toLowerCase()) || test.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((test) => test.id)));
    }
  };

  const handleRun = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map((testId) => runSingleTest(testId, mode, undefined, undefined, sessionId)));
      setRanTests(new Set(ids));
      setTimeout(onRanTest, 500);
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-900">{t.sessions.runTestsInSession}</h2>
          <p className="text-[11px] text-slate-400">{t.sessions.selectTestsHint}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Search + Select All */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.sessions.searchTests}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-slate-300"
            />
          </div>
          <button
            onClick={selectAll}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 ring-inset hover:bg-slate-50 transition-colors"
          >
            {selected.size === filtered.length && filtered.length > 0 ? t.sessions.deselectAll : t.sessions.selectAll}
          </button>
        </div>

        {/* Test list */}
        {testsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {filtered.map((test) => {
              const isSelected = selected.has(test.id);
              const wasRan = ranTests.has(test.id);
              return (
                <label
                  key={test.id}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(test.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-900 truncate">{test.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{test.id}</div>
                  </div>
                  {test.tags?.[0] && (
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{test.tags[0]}</span>
                  )}
                  {wasRan && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                </label>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-400">{t.sessions.noTestsFound}</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500">
            {selected.size > 0 ? `${selected.size} ${t.sessions.testSelected}` : t.sessions.noTestsSelected}
          </span>
          <button
            onClick={handleRun}
            disabled={running || selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? t.common.running : `${t.sessions.runTests}${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
