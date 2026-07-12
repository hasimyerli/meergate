'use client';

import Link from 'next/link';
import { ListChecks, Activity, FolderOpen, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export type SectionTab = 'tests' | 'runs' | 'sessions' | 'schedules';

/**
 * Shared tab bar that unifies the test workspace — the library (Tests),
 * its run history (Runs), saved collections (Sessions) and cron rules
 * (Schedules) — into one section reachable across their routes.
 */
export function SectionTabs({ active, runsBadge }: { active: SectionTab; runsBadge?: number }) {
  const { t } = useI18n();
  const tabs: { key: SectionTab; href: string; icon: typeof ListChecks; label: string }[] = [
    { key: 'tests', href: '/tests', icon: ListChecks, label: t.nav.testSuites },
    { key: 'runs', href: '/tests?tab=runs', icon: Activity, label: t.tests.allRunsTab },
    { key: 'sessions', href: '/sessions', icon: FolderOpen, label: t.nav.validationSessions },
    { key: 'schedules', href: '/schedules', icon: Clock, label: t.nav.scheduledRuns },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors -mb-px',
              isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700',
            )}
          >
            <Icon className="h-3.5 w-3.5" />{tab.label}
            {tab.key === 'runs' && runsBadge ? (
              <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{runsBadge}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
