'use client';

import { useState } from 'react';
import { StatusBadge } from './status-badge';
import { formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  ChevronDown, Globe, Radio, Clock, CheckCircle2, Server, Play, Monitor, RotateCcw,
  Copy, Check, Code2, Network,
} from 'lucide-react';
import type { StepResultItem, ManifestStep } from '@/lib/api';
import { ResponseSchemaTree } from './response-schema-tree';
import { useI18n } from '@/lib/i18n';

const stepTypeConfig: Record<string, { icon: typeof Globe; label: string; color: string }> = {
  apiCall:       { icon: Globe,         label: 'REST',    color: 'bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200' },
  grpcCall:      { icon: Server,        label: 'gRPC',    color: 'bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-200' },
  wsSubscribe:   { icon: Radio,         label: 'WS',      color: 'bg-cyan-50 text-cyan-600 ring-1 ring-inset ring-cyan-200' },
  waitUntil:     { icon: Clock,         label: 'Wait',    color: 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200' },
  assert:        { icon: CheckCircle2,  label: 'Assert',  color: 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200' },
  browserAction: { icon: Monitor,       label: 'Browser', color: 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200' },
};

const GRPC_STATUS: Record<number, string> = {
  0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED', 13: 'INTERNAL', 14: 'UNAVAILABLE', 16: 'UNAUTHENTICATED',
};

const statusBorder: Record<string, string> = {
  passed: 'border-l-emerald-500',
  failed: 'border-l-red-500',
  error: 'border-l-amber-500',
  running: 'border-l-blue-500',
  pending: 'border-l-slate-300',
  skipped: 'border-l-slate-300',
};

interface StepCardProps {
  step: StepResultItem;
  index: number;
  onResume?: (stepIndex: number) => void;
  resuming?: boolean;
}

export function StepCard({ step, index, onResume, resuming }: StepCardProps) {
  const { t } = useI18n();
  // Auto-expand failed/error steps
  const [expanded, setExpanded] = useState(
    step.status === 'failed' || step.status === 'error'
  );
  const typeConf = stepTypeConfig[step.step_type] ?? { icon: Globe, label: step.step_type, color: 'bg-slate-100 text-slate-600' };
  const Icon = typeConf.icon;
  const canResume = (step.status === 'failed' || step.status === 'error') && onResume;
  const hasFailed = step.assertions?.some((a) => !a.passed);
  const borderColor = statusBorder[step.status] ?? 'border-l-slate-200';

  return (
    <div
      className={cn(
        'rounded-lg border border-l-[3px] bg-white overflow-hidden shadow-sm',
        borderColor,
        step.status === 'failed' || step.status === 'error'
          ? 'border-red-200 ring-1 ring-red-100'
          : 'border-slate-200',
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          expanded ? 'bg-slate-50/50' : 'hover:bg-slate-50/50',
        )}
      >
        {/* Type badge */}
        <span className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold shrink-0', typeConf.color)}>
          <Icon className="h-3 w-3" />
          {typeConf.label}
        </span>

        {/* Name */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 truncate">{step.step_name}</span>
            {step.step_type === 'grpcCall' && step.request_summary && (
              <GrpcBadge request={step.request_summary} response={step.response_summary} />
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex shrink-0 items-center gap-3">
          {step.retry_count > 0 && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              {t.stepCard.retry} &times;{step.retry_count}
            </span>
          )}
          <span className="text-xs font-mono font-medium text-slate-500 tabular-nums">{formatDuration(step.duration_ms)}</span>
          <StatusBadge status={step.status} size="xs" />
          <ChevronDown
            className={cn('h-4 w-4 text-slate-400 shrink-0 transition-transform', expanded && 'rotate-180')}
          />
        </div>
      </button>

      {/* Expanded Body */}
      {expanded && (
        <div className="border-t border-slate-100 animate-slideDown">
          {/* Assertions — most important, show first */}
          {step.assertions && step.assertions.length > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t.stepCard.assertions}
                </p>
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-[9px] font-bold',
                  hasFailed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
                )}>
                  {step.assertions.filter((a) => a.passed).length}/{step.assertions.length} passed
                </span>
              </div>
              <div className="space-y-1">
                {step.assertions.map((a, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-2.5 rounded-md px-3 py-2 text-xs',
                      a.passed
                        ? 'bg-emerald-50/60 text-emerald-800'
                        : 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
                    )}
                  >
                    {a.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5">!</span>
                    )}
                    <span className="font-medium flex-1">{a.name}</span>
                    {!a.passed && a.expected !== undefined && (
                      <div className="shrink-0 text-right text-[10px] opacity-80 font-mono">
                        <div>expected: <code>{JSON.stringify(a.expected)}</code></div>
                        <div>got: <code>{JSON.stringify(a.actual)}</code></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {step.error && (
            <div className="px-4 py-3 bg-red-50/30">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-500">{t.stepCard.error}</p>
              <pre className="rounded-md bg-red-50 px-3 py-2.5 text-[11px] text-red-800 overflow-x-auto leading-relaxed border border-red-100 font-mono">
                {step.error}
              </pre>
            </div>
          )}

          {/* Request/Response with Raw/Schema tabs */}
          {(step.request_summary || step.response_summary) && (
            <DataSection request={step.request_summary} response={step.response_summary} />
          )}

          {/* Resume action */}
          {canResume && (
            <div className="flex items-center justify-end px-4 py-3 bg-slate-50/50 border-t border-slate-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onResume!(step.step_index);
                }}
                disabled={resuming}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {resuming ? <RotateCcw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                {t.stepCard.resumeFromHere}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NotRunStepCard({ manifestStep, index }: { manifestStep: ManifestStep; index: number }) {
  const { t } = useI18n();
  const typeConf = stepTypeConfig[manifestStep.type] ?? { icon: Globe, label: manifestStep.type, color: 'bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200' };
  const Icon = typeConf.icon;

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold shrink-0 opacity-50', typeConf.color)}>
          <Icon className="h-3 w-3" />
          {typeConf.label}
        </span>
        <span className="text-sm text-slate-400 truncate flex-1">{manifestStep.name}</span>
        {manifestStep.dependsOn && manifestStep.dependsOn.length > 0 && (
          <div className="flex flex-wrap gap-1 shrink-0">
            {manifestStep.dependsOn.map((dep) => (
              <span key={dep} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-400">
                after: {dep}
              </span>
            ))}
          </div>
        )}
        <span className="shrink-0 text-[10px] font-medium text-slate-300">{t.common.skipped}</span>
      </div>
    </div>
  );
}

/* ── JSON Block with copy ── */
function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <button
          onClick={(e) => { e.stopPropagation(); copy(); }}
          className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          {copied ? t.common.copied : t.common.copy}
        </button>
      </div>
      <pre className="rounded-md bg-slate-900 px-4 py-3 text-[11px] text-slate-200 overflow-x-auto leading-relaxed max-h-[300px]">
        {json}
      </pre>
    </div>
  );
}

/* ── Data Section with Raw/Schema tabs ── */
function DataSection({ request, response }: {
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'raw' | 'schema'>('raw');

  return (
    <div className="border-t border-slate-100">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-2">
        <button
          onClick={(e) => { e.stopPropagation(); setTab('raw'); }}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold',
            tab === 'raw' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600',
          )}
        >
          <Code2 className="h-3 w-3" />
          {t.stepCard.rawJson}
        </button>
        {response && (
          <button
            onClick={(e) => { e.stopPropagation(); setTab('schema'); }}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold',
              tab === 'schema' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600',
            )}
          >
            <Network className="h-3 w-3" />
            {t.stepCard.schema}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {tab === 'raw' && (
          <>
            {request && <JsonBlock label={t.stepCard.request} data={request} />}
            {response && <JsonBlock label={t.stepCard.response} data={response} />}
          </>
        )}
        {tab === 'schema' && response && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t.stepCard.responseSchema}</p>
            <div className="rounded-md border border-slate-200 bg-white p-2 max-h-[400px] overflow-auto">
              <ResponseSchemaTree data={response} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GrpcBadge({
  request,
  response,
}: {
  request: Record<string, unknown>;
  response: Record<string, unknown> | null;
}) {
  const service = request.service as string | undefined;
  const method = request.method as string | undefined;
  const statusCode = response?.grpcStatusCode as number | undefined;
  const shortService = service?.split('.').pop() ?? '';
  const statusName = statusCode != null ? GRPC_STATUS[statusCode] ?? `CODE_${statusCode}` : '';
  const isOk = statusCode === 0;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {shortService && method && (
        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
          {shortService}/{method}
        </span>
      )}
      {statusCode != null && (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[9px] font-bold',
            isOk ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
          )}
        >
          {statusName}
        </span>
      )}
    </span>
  );
}
