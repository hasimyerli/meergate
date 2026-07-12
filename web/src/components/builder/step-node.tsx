'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { StepData } from '@/app/builder/page';
import { Globe, Server, Wifi, Clock, CheckCircle, Monitor, Loader2, XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

const typeConfig: Record<string, { icon: typeof Globe; color: string; bg: string; border: string }> = {
  apiCall: { icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  grpcCall: { icon: Server, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  wsSubscribe: { icon: Wifi, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
  waitUntil: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  assert: { icon: CheckCircle, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  browserAction: { icon: Monitor, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
};

/** Readable node labels — English in both locales, matches i18n stepCard.type*. */
const NODE_LABELS: Record<string, string> = {
  apiCall: 'API Call',
  grpcCall: 'gRPC Call',
  wsSubscribe: 'WebSocket',
  browserAction: 'Browser',
  waitUntil: 'Wait',
  assert: 'Assert',
};

const runStatusConfig: Record<string, { border: string; bg: string; icon: typeof CheckCircle2; iconColor: string }> = {
  passed: { border: 'border-emerald-400', bg: 'bg-emerald-50', icon: CheckCircle2, iconColor: 'text-emerald-500' },
  failed: { border: 'border-red-400', bg: 'bg-red-50', icon: XCircle, iconColor: 'text-red-500' },
  error: { border: 'border-orange-400', bg: 'bg-orange-50', icon: AlertTriangle, iconColor: 'text-orange-500' },
  running: { border: 'border-blue-400', bg: 'bg-blue-50', icon: Loader2, iconColor: 'text-blue-500' },
  skipped: { border: 'border-slate-300', bg: 'bg-slate-50', icon: Clock, iconColor: 'text-slate-400' },
};

const cinemaClassMap: Record<string, string> = {
  waiting: 'cinema-waiting',
  running: 'cinema-running',
  passed: 'cinema-passed',
  failed: 'cinema-failed',
  error: 'cinema-error',
  skipped: 'cinema-skipped',
};

function StepNodeComponent({ data, selected }: { data: StepData; selected?: boolean } & Record<string, unknown>) {
  const cfg = typeConfig[data.type] ?? typeConfig.apiCall!;
  const Icon = cfg.icon;
  const runStatus = data.runStatus as string | undefined;
  const runDurationMs = data.runDurationMs as number | undefined;
  const cinemaState = data.cinemaState as string | undefined;
  const statusCfg = runStatus ? runStatusConfig[runStatus] : null;
  const StatusIcon = statusCfg?.icon;

  const borderClass = statusCfg
    ? `${statusCfg.border} ${statusCfg.bg}`
    : selected
      ? 'border-indigo-500 shadow-md shadow-indigo-100'
      : `${cfg.border} ${cfg.bg}`;

  const cinemaClass = cinemaState ? cinemaClassMap[cinemaState] ?? '' : '';

  return (
    <div className={`relative rounded-xl border-2 shadow-sm min-w-[220px] max-w-[280px] transition-all ${borderClass} ${cinemaClass}`}>
      <Handle type="target" position={Position.Top}   id="t-top"    className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />
      <Handle type="target" position={Position.Left}  id="t-left"   className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`flex h-6 w-6 items-center justify-center rounded-md ${cfg.color} bg-white/80`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-slate-500">{NODE_LABELS[data.type] ?? data.type}</span>
          {StatusIcon && (
            <div className="ml-auto flex items-center gap-1">
              <StatusIcon className={`h-4 w-4 ${statusCfg!.iconColor} ${runStatus === 'running' ? 'animate-spin' : ''}`} />
              {runDurationMs != null && (
                <span className="text-[9px] font-medium text-slate-500">{runDurationMs}ms</span>
              )}
            </div>
          )}
        </div>
        <div className="text-sm font-medium text-slate-800 truncate">{data.name}</div>

        {data.type === 'apiCall' && !!data.config.method && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
              {String(data.config.method)}
            </span>
            <span className="text-[11px] text-slate-500 truncate">{String(data.config.path ?? '')}</span>
          </div>
        )}

        {data.type === 'grpcCall' && !!data.config.rpcMethod && (
          <div className="mt-1.5">
            <span className="text-[11px] text-slate-500 truncate block">
              {String(data.config.service ?? '').split('.').pop()}.{String(data.config.rpcMethod)}
            </span>
          </div>
        )}

        {data.type === 'browserAction' && !!data.config.action && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
              {String(data.config.action)}
            </span>
            <span className="text-[11px] text-slate-500 truncate">{String(data.config.selector ?? data.config.url ?? '')}</span>
          </div>
        )}

        {data.assertions.length > 0 && (
          <div className="mt-1.5 text-[10px] text-slate-400">
            {data.assertions.length} assertion{data.assertions.length > 1 ? 's' : ''}
          </div>
        )}

        {Object.keys(data.extract).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.keys(data.extract).map((k) => (
              <span key={k} className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="t-bottom" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
      <Handle type="source" position={Position.Right}  id="t-right"  className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
