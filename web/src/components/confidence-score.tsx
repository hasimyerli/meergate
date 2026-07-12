'use client';

import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn, tkey } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { statusColor, type ConfidenceResult, type ConfidenceStatus } from '@/lib/confidence';

const STATUS_LABEL_KEY: Record<ConfidenceStatus, string> = {
  ready: 'confidence.statusReady',
  watch: 'confidence.statusWatch',
  risky: 'confidence.statusRisky',
  blocked: 'confidence.statusBlocked',
  unknown: 'confidence.statusUnknown',
};

/**
 * The hero "API Confidence Score" card — the single answer to "can we release
 * safely?". Renders the score, a status pill, and the blocking issues. When the
 * score can't be computed it shows an honest "not enough data" state.
 */
export function ConfidenceScore({ result, compact, showBlockers = true }: { result: ConfidenceResult; compact?: boolean; showBlockers?: boolean }) {
  const { t } = useI18n();
  const color = statusColor(result.status);
  const statusLabel = tkey(t, STATUS_LABEL_KEY[result.status]);

  return (
    <div className={cn('flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5', compact && 'p-4', !showBlockers && 'justify-center')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={cn('flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl ring-1', color.bg, color.ring)}>
            <ShieldCheck className={cn('h-8 w-8', color.text)} strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.confidence.scoreTitle}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className={cn('text-4xl font-bold tabular-nums', result.score === null ? 'text-slate-300' : 'text-slate-900')}>
                {result.score ?? '—'}
              </span>
              {result.score !== null && <span className="text-sm font-medium text-slate-400">{t.confidence.outOf100}</span>}
            </div>
            <div className="mt-1 text-sm text-slate-500">{t.confidence.scoreSubtitle}</div>
          </div>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1', color.bg, color.text, color.ring)}>
          <span className={cn('h-2 w-2 rounded-full', color.dot)} />
          {statusLabel}
        </span>
      </div>

      {!showBlockers ? null : !result.hasEnoughData ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-[13px] text-slate-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
          <div>
            <div className="font-medium text-slate-600">{t.confidence.notEnoughData}</div>
            <div className="text-[12px]">{t.confidence.notEnoughDataHint}</div>
          </div>
        </div>
      ) : result.blockers.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-[13px]">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          <span className="font-medium text-emerald-700">{t.confidence.youreClear}</span>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.confidence.blockersTitle}</div>
          <ul className="space-y-1">
            {result.blockers.map((b) => (
              <li key={b.code} className="flex items-center gap-2 text-[13px] text-slate-600">
                <span className={cn(
                  'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                  b.severity === 'critical' ? 'bg-red-500' : b.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-300',
                )} />
                {tkey(t, b.labelKey, b.detail as Record<string, string | number>)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
