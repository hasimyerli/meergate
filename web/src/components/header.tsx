'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { FlaskConical, LayoutDashboard, ListChecks, History, Clock, FolderOpen, Workflow } from 'lucide-react';

export function Header() {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { href: '/', label: t.nav.dashboard, icon: LayoutDashboard },
    { href: '/tests', label: t.tests.testsTab, icon: ListChecks },
    { href: '/tests?tab=runs', label: t.tests.allRunsTab, icon: History },
    { href: '/sessions', label: t.nav.sessions, icon: FolderOpen },
    { href: '/schedules', label: t.nav.schedules, icon: Clock },
    { href: '/builder', label: t.nav.builder, icon: Workflow },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
      <div className="px-6">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm shadow-indigo-200 transition-shadow group-hover:shadow-md group-hover:shadow-indigo-200">
                <FlaskConical className="h-4 w-4 text-white" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-slate-900">
                Inkling
                <span className="mx-1 font-normal text-slate-300">/</span>
                <span className="font-medium text-slate-600">{t.nav.testDashboard}</span>
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
