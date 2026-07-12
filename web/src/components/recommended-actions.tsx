'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn, tkey } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { Blocker, Severity } from '@/lib/confidence';

const SEVERITY_ICON: Record<Severity, typeof AlertCircle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-slate-400',
};

/**
 * Turns confidence blockers into concrete next steps, each linking to a real
 * route. When there are none it shows an honest "you're clear" state — never a
 * fabricated task.
 */
export function RecommendedActions({ blockers, title }: { blockers: Blocker[]; title?: string }) {
  const { t } = useI18n();

  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 text-sm font-semibold text-slate-800">{title ?? t.overview.recommendedNextSteps}</div>
      {blockers.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-slate-500">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          <span>{t.confidence.youreClearHint}</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {blockers.map((b) => {
            const Icon = SEVERITY_ICON[b.severity];
            return (
              <li key={b.code}>
                <Link
                  href={b.actionRoute}
                  className="group flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <Icon className={cn('h-4 w-4 flex-shrink-0', SEVERITY_TONE[b.severity])} />
                  <span className="flex-1 text-[13px] text-slate-700">
                    {tkey(t, b.labelKey, b.detail as Record<string, string | number>)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-indigo-600 group-hover:text-indigo-700">
                    {tkey(t, b.actionKey)}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
