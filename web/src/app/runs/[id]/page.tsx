'use client';

import { useState, useEffect, useCallback, use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchRunDetail, resumeRun, type RunDetail } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { RunTimeline } from '@/components/run-timeline';

import { RunNotes } from '@/components/run-notes';
import { formatDuration, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import {
  ArrowLeft, RefreshCw, GitBranch, Globe, Tag, Bookmark,
  Play, RotateCcw, Link2, Hash, Copy, Check, Clock,
  CheckCircle2, XCircle, AlertTriangle, Timer, Bug,
} from 'lucide-react';

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRun(await fetchRunDetail(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (run?.status === 'running' || run?.status === 'pending') {
      const interval = setInterval(load, 2000);
      return () => clearInterval(interval);
    }
  }, [id, run?.status]);

  const handleResume = useCallback(async (fromStep: number) => {
    setResuming(true);
    try {
      const result = await resumeRun(id, fromStep);
      router.push(`/runs/${result.run_id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resume run');
    } finally {
      setResuming(false);
    }
  }, [id, router]);

  const copyId = () => {
    navigator.clipboard.writeText(run?.id ?? id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const failedStep = run?.steps.find((s) => s.status === 'failed' || s.status === 'error');
  const canResume = (run?.status === 'failed' || run?.status === 'error') && failedStep;

  const stepStats = useMemo(() => {
    if (!run) return null;
    const passed = run.steps.filter((s) => s.status === 'passed').length;
    const failed = run.steps.filter((s) => s.status === 'failed').length;
    const errored = run.steps.filter((s) => s.status === 'error').length;
    const running = run.steps.filter((s) => s.status === 'running').length;
    const total = run.manifest?.steps?.length ?? run.steps.length;
    return { passed, failed, errored, running, total };
  }, [run]);

  if (loading && !run) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-[140px]" />
        <div className="skeleton h-[60px]" />
        <div className="skeleton h-[300px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <XCircle className="h-10 w-10 text-red-300" />
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/tests?tab=runs" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          &larr; {t.tests.allRunsTab}
        </Link>
      </div>
    );
  }

  if (!run) return null;

  const manifestSteps = run.manifest?.steps;
  const contextItems = [
    run.environment && { icon: Globe, label: run.environment },
    run.git_ref && { icon: GitBranch, label: `${run.git_ref}${run.git_commit ? `@${run.git_commit.slice(0, 7)}` : ''}` },
    run.triggered_by && { icon: null, label: `by ${run.triggered_by}` },
  ].filter(Boolean) as { icon: typeof Globe | null; label: string }[];

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb + Actions (sticky) ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/tests?tab=runs"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Runs</span>
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-lg font-bold text-slate-900 truncate">{run.test_id}</h1>
          <StatusBadge status={run.status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyLink}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title={t.common.copy}
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            onClick={load}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title={t.common.refresh}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {(run.status === 'failed' || run.status === 'error') && (
            <button
              onClick={() => router.push(`/builder?debug=${run.id}`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 shadow-sm"
            >
              <Bug className="h-3.5 w-3.5" />
              Debug with AI
            </button>
          )}
          {canResumeRun(canResume) && (
            <button
              onClick={() => handleResume(failedStep!.step_index)}
              disabled={resuming}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {resuming ? <RotateCcw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Resume from Step {failedStep!.step_index + 1}
            </button>
          )}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {run.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3 animate-fadeIn">
          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-800">{t.common.failed}</p>
            <p className="mt-0.5 text-xs text-red-600 break-all">{run.error}</p>
          </div>
        </div>
      )}

      {/* ── Summary Strip ── */}
      <div className="card">
        <div className="flex flex-wrap items-center divide-x divide-slate-100">
          {/* Stats */}
          <div className="flex items-center gap-5 px-5 py-3">
            {stepStats && (
              <>
                {stepStats.passed > 0 && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-700">{stepStats.passed}</span>
                    <span className="text-xs text-slate-400">{t.common.passed}</span>
                  </div>
                )}
                {stepStats.failed > 0 && (
                  <div className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-semibold text-red-700">{stepStats.failed}</span>
                    <span className="text-xs text-slate-400">{t.common.failed}</span>
                  </div>
                )}
                {stepStats.errored > 0 && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold text-amber-700">{stepStats.errored}</span>
                    <span className="text-xs text-slate-400">{t.common.error}</span>
                  </div>
                )}
                {stepStats.running > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <span className="text-sm font-semibold text-blue-700">{stepStats.running}</span>
                    <span className="text-xs text-slate-400">{t.common.running}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Meta pills */}
          <div className="flex items-center gap-3 px-5 py-3">
            <MetaPill icon={Timer} label={formatDuration(run.duration_ms)} />
            <MetaPill icon={Clock} label={formatDate(run.started_at, localeStr)} />
            {run.trigger && (
              <span className={cn(
                'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                run.trigger === 'ci' ? 'bg-purple-50 text-purple-700' :
                run.trigger === 'scheduled' ? 'bg-cyan-50 text-cyan-700' :
                run.trigger === 'webhook' ? 'bg-amber-50 text-amber-700' :
                'bg-slate-100 text-slate-600',
              )}>
                {run.trigger}
              </span>
            )}
          </div>

          {/* Context */}
          {contextItems.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-3">
              {contextItems.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs text-slate-500">
                  {item.icon && <item.icon className="h-3 w-3 text-slate-400" />}
                  <span className="font-mono">{item.label}</span>
                </span>
              ))}
            </div>
          )}

          {/* Links */}
          <div className="flex items-center gap-2 px-5 py-3 ml-auto">
            {run.jira_ref && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
                <Tag className="h-2.5 w-2.5" />{run.jira_ref}
              </span>
            )}
            {run.label && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                <Bookmark className="h-2.5 w-2.5" />{run.label}
              </span>
            )}
            {run.session_id && (
              <Link
                href={`/sessions/${run.session_id}`}
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
              >
                <Link2 className="h-3 w-3" />{t.tests.session}
              </Link>
            )}
            {run.run_tags && run.run_tags.length > 0 && run.run_tags.map((tag) => (
              <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{tag}</span>
            ))}
          </div>
        </div>

        {/* Run ID + Correlation */}
        <div className="flex items-center gap-4 border-t border-slate-100 px-5 py-2 text-[10px] font-mono text-slate-400">
          <button
            onClick={copyId}
            className="inline-flex items-center gap-1.5 hover:text-slate-600"
            title={t.common.copy}
          >
            {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {run.id}
          </button>
          {run.correlation_id && (
            <>
              <span className="text-slate-200">|</span>
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3 text-slate-300" />
                {run.correlation_id}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Step Overview ── */}
      {manifestSteps && manifestSteps.length > 0 && (
        <div className="card px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {manifestSteps.map((ms, i) => {
              const executed = run.steps.find((s) => s.step_name === ms.name);
              const status = executed?.status;
              return (
                <a
                  key={i}
                  href={`#step-${i}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium border',
                    status === 'passed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'failed' || status === 'error'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : status === 'running'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-50 text-slate-400 border-slate-200',
                    'hover:opacity-80',
                  )}
                >
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    status === 'passed' ? 'bg-emerald-500'
                      : status === 'failed' || status === 'error' ? 'bg-red-500'
                      : status === 'running' ? 'bg-blue-500 animate-pulse'
                      : 'bg-slate-300',
                  )} />
                  <span className="truncate max-w-[140px]">{ms.name}</span>
                  {executed?.duration_ms != null && (
                    <span className="text-[9px] opacity-60 font-mono tabular-nums">{formatDuration(executed.duration_ms)}</span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      <RunNotes runId={id} />

      {/* ── Timeline ── */}
      <RunTimeline
        steps={run.steps}
        artifacts={run.artifacts}
        manifestSteps={manifestSteps}
        onResume={handleResume}
        resuming={resuming}
      />
    </div>
  );
}

function MetaPill({ icon: Icon, label, variant = 'default' }: {
  icon: typeof Clock; label: string; variant?: 'default' | 'warning';
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs',
      variant === 'warning' ? 'text-orange-700 font-semibold' : 'text-slate-600',
    )}>
      <Icon className={cn('h-3.5 w-3.5', variant === 'warning' ? 'text-orange-500' : 'text-slate-400')} />
      {label}
    </span>
  );
}

function canResumeRun(
  canResume: RunDetail['steps'][0] | undefined | false,
): canResume is RunDetail['steps'][0] {
  return Boolean(canResume);
}
