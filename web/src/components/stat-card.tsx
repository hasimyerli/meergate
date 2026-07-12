'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Canonical value card used across Overview and Service Catalog. When
 * `unavailable` is set it renders an honest "—" instead of a fabricated value.
 * Optionally links somewhere and shows a progress bar.
 */
export function StatCard({
  label,
  value,
  icon,
  hint,
  progress,
  unavailable,
  href,
  tone,
}: {
  label: string;
  value: string | number | null;
  icon?: ReactNode;
  hint?: string;
  progress?: number | null;
  unavailable?: boolean;
  href?: string;
  tone?: { text?: string; bg?: string };
}) {
  const body = (
    <div className={cn(
      'flex h-full flex-col gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors',
      href && 'hover:border-slate-300 hover:bg-slate-50/60',
    )}>
      <div className="flex items-center gap-2">
        {icon && (
          <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', tone?.bg ?? 'bg-slate-50')}>
            {icon}
          </span>
        )}
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={cn('text-xl font-semibold', unavailable ? 'text-slate-300' : tone?.text ?? 'text-slate-800')}>
          {unavailable ? '—' : value}
        </span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {typeof progress === 'number' && !unavailable && (
        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn('h-full rounded-full', tone?.text ? tone.text.replace('text-', 'bg-') : 'bg-indigo-500')}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );

  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
