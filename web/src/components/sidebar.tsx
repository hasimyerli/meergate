'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  FlaskConical,
  Home,
  ListChecks,
  BarChart3,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Boxes,
  ShieldCheck,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { usernameFromToken } from '@/lib/auth';
import { fetchAlertEvents } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useState, useEffect } from 'react';

interface NavItem {
  href: string;
  labelKey: 'home' | 'insights' | 'alerts' | 'serviceCatalog' | 'testSuites' | 'runCenter' | 'releaseGates';
  icon: typeof Home;
  badge?: string;
  /** Custom active matcher (for routes that share a path, e.g. /tests). */
  match?: (pathname: string, tab: string | null) => boolean;
}

interface NavSection {
  labelKey: 'control' | 'operations';
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    labelKey: 'control',
    items: [
      { href: '/dashboard', labelKey: 'home', icon: Home, match: (p) => p.startsWith('/dashboard') },
      { href: '/targets', labelKey: 'serviceCatalog', icon: Boxes },
      {
        href: '/tests',
        labelKey: 'testSuites',
        icon: ListChecks,
        match: (p) => p.startsWith('/tests') || p.startsWith('/sessions') || p.startsWith('/schedules'),
      },
      { href: '/release-gates', labelKey: 'releaseGates', icon: ShieldCheck },
    ],
  },
  {
    labelKey: 'operations',
    items: [
      { href: '/alerts', labelKey: 'alerts', icon: Bell },
      { href: '/analytics', labelKey: 'insights', icon: BarChart3 },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab');
  const { logout, token } = useAuth();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  // Open (unacknowledged) alert count for the nav badge; refreshes on navigation.
  useEffect(() => {
    let active = true;
    fetchAlertEvents({ acknowledged: 0, limit: 1 })
      .then((r) => { if (active) setOpenAlerts(r.total); })
      .catch(() => { if (active) setOpenAlerts(0); });
    return () => { active = false; };
  }, [pathname]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: next }));
  };

  const isActive = (item: NavItem) => {
    if (item.match) return item.match(pathname, activeTab);
    const base = item.href.split('?')[0];
    return base === '/' ? pathname === '/' : pathname.startsWith(base);
  };

  const username = usernameFromToken(token);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-700/60',
        'bg-slate-800 transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      {/* ── Brand + collapse ── */}
      <div className={cn(
        'flex shrink-0 items-center border-b border-slate-700/60 p-2',
        collapsed ? 'flex-col gap-2' : 'gap-2.5',
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
          <FlaskConical className="h-[17px] w-[17px] text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight text-white">Inkling</div>
            <div className="flex items-center gap-1 text-[11px] leading-tight text-slate-400">
              <span className="rounded bg-blue-500/15 px-1 py-px text-[9px] font-bold text-blue-300">PRO</span>
              <span className="truncate">Test Platform</span>
            </div>
          </div>
        )}
        <button
          onClick={toggle}
          title={t.nav.collapse}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
        >
          {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto py-4">
        {sections.map((section, si) => {
          return (
            <div key={si} className={si > 0 ? 'mt-5' : ''}>
              {collapsed ? (
                si > 0 && <div className="mx-auto mb-3 h-px w-6 bg-slate-700/60" />
              ) : (
                <div className="mb-1.5 px-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  {t.nav[section.labelKey]}
                </div>
              )}
              <div className="space-y-0.5 px-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item);
                  const itemLabel = t.nav[item.labelKey];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? itemLabel : undefined}
                      className={cn(
                        'group relative flex items-center rounded-lg text-[13px]',
                        collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 h-9',
                        active
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-blue-400" />
                      )}
                      <Icon strokeWidth={1.75} className={cn(
                        'h-[18px] w-[18px] shrink-0',
                        active ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-200',
                      )} />
                      {item.labelKey === 'alerts' && openAlerts > 0 && collapsed && (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-800" />
                      )}
                      {!collapsed && (
                        <>
                          <span className="flex-1 font-medium">{itemLabel}</span>
                          {item.labelKey === 'alerts' && openAlerts > 0 && (
                            <span className="rounded-full bg-red-500/90 px-1.5 py-px text-[9px] font-bold text-white">
                              {openAlerts}
                            </span>
                          )}
                          {item.badge && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-px text-[9px] font-bold text-amber-400">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {/* Tooltip */}
                      {collapsed && (
                        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 opacity-0 shadow-lg group-hover:opacity-100 z-[60] border border-slate-700/50">
                          {itemLabel}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* System — Settings + Sign Out as menu items */}
        <div className="mt-5">
          {collapsed ? (
            <div className="mx-auto mb-3 h-px w-6 bg-slate-700/60" />
          ) : (
            <div className="mb-1.5 px-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              {t.nav.system}
            </div>
          )}
          <div className="space-y-0.5 px-3">
            <NavLink
              href="/settings"
              icon={Settings}
              label={t.nav.settings}
              active={pathname === '/settings'}
              collapsed={collapsed}
            />
            <button
              onClick={() => logout()}
              title={collapsed ? t.nav.signOut : undefined}
              className={cn(
                'group relative flex w-full items-center rounded-lg text-[13px] text-slate-300 hover:bg-red-500/10 hover:text-red-400',
                collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-3 px-3 h-9',
              )}
            >
              <LogOut strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="font-medium">{t.nav.signOut}</span>}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 opacity-0 shadow-lg group-hover:opacity-100 z-[60] border border-slate-700/50">
                  {t.nav.signOut}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Footer: identity only ── */}
      <div className="shrink-0 border-t border-slate-700/60 p-3">
        {collapsed ? (
          <div className="text-center text-[11px] font-bold text-slate-400">
            {username.slice(0, 2).toUpperCase()}
          </div>
        ) : (
          <div className="px-2">
            <div className="truncate text-[13px] font-semibold leading-tight text-white">{username}</div>
            <div className="truncate text-[11px] leading-tight text-slate-400">{t.nav.administrator}</div>
          </div>
        )}
      </div>
    </aside>
  );
}

function NavLink({ href, icon: Icon, label, active, collapsed }: {
  href: string; icon: typeof Settings; label: string; active: boolean; collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex items-center rounded-lg text-[13px]',
        collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-3 px-3 h-9',
        active
          ? 'bg-blue-500/15 text-blue-300'
          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
      )}
    >
      <Icon strokeWidth={1.75} className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-200')} />
      {!collapsed && <span className="font-medium">{label}</span>}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 opacity-0 shadow-lg group-hover:opacity-100 z-[60] border border-slate-700/50">
          {label}
        </span>
      )}
    </Link>
  );
}
