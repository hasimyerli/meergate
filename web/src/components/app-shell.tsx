'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Sidebar } from '@/components/sidebar';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const isBuilderPage = pathname === '/builder';
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);

    const handler = (e: Event) => setCollapsed((e as CustomEvent).detail);
    window.addEventListener('sidebar-toggle', handler);
    return () => window.removeEventListener('sidebar-toggle', handler);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-[3px] border-blue-600/20 border-t-blue-600 animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Loading&hellip;</p>
        </div>
      </div>
    );
  }

  if (!token && !isLoginPage) return null;
  if (isLoginPage) return <>{children}</>;

  return (
    <>
      <Sidebar />
      <div className={cn(
        'transition-[padding] duration-200 ease-in-out',
        collapsed ? 'pl-[68px]' : 'pl-[240px]',
      )}>
        <main className={cn(
          isBuilderPage
            ? 'h-screen overflow-hidden'
            : 'min-h-screen px-6 py-6',
        )}>
          {children}
        </main>
      </div>
    </>
  );
}
