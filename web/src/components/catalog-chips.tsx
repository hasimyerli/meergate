'use client';

import { Network, Globe2, Zap, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { CatalogEntry } from '@/lib/api';

type HealthStatus = CatalogEntry['health_status'];

/** Small colored dot representing live health (green/red/gray). */
export function HealthDot({ status, showLabel }: { status: HealthStatus; showLabel?: boolean }) {
  const { t } = useI18n();
  const color = status === 'healthy' ? 'bg-emerald-500' : status === 'unreachable' ? 'bg-red-500' : 'bg-slate-300';
  const label = status === 'healthy' ? t.catalog.healthy : status === 'unreachable' ? t.catalog.unreachable : t.catalog.unknownHealth;
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {showLabel && <span className="text-[10px] text-slate-500">{label}</span>}
    </span>
  );
}

/** Latency chip, e.g. "42ms". */
export function LatencyChip({ ms }: { ms?: number | null }) {
  if (ms === undefined || ms === null) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
      <Zap className="h-2.5 w-2.5" /> {ms}ms
    </span>
  );
}

/** Amber "Drift" badge shown when the last sync detected a schema drift. */
export function DriftBadge({ summary }: { summary?: string | null }) {
  const { t } = useI18n();
  if (!summary) return null;
  // A removed operation ("-N") is a breaking change → red; additions only → amber.
  const breaking = summary.includes('-');
  const cls = breaking ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={breaking ? `${t.catalog.breaking}: ${summary}` : `${t.catalog.drift}: ${summary}`}
    >
      <AlertTriangle className="h-2.5 w-2.5" /> {breaking ? t.catalog.breaking : t.catalog.drift}: {summary}
    </span>
  );
}

/** Protocol icon — gRPC (network) vs REST (globe). */
export function ProtocolIcon({ protocol, className }: { protocol: 'grpc' | 'rest'; className?: string }) {
  return protocol === 'grpc'
    ? <Network className={className ?? 'h-3.5 w-3.5 text-violet-600'} />
    : <Globe2 className={className ?? 'h-3.5 w-3.5 text-blue-600'} />;
}
