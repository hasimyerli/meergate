'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { CatalogEntry } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface PaletteItem { serviceId: string; label: string; sub: string; }

/** Cmd-K jump-to across every service + discovered method/endpoint. */
export function CatalogCommandPalette({ entries, onOpen, onClose }: {
  entries: CatalogEntry[];
  onOpen: (serviceId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    for (const e of entries) {
      out.push({ serviceId: e.id, label: e.name || e.id, sub: e.target });
      const cat = e.catalog as Record<string, unknown> | null;
      if (e.protocol === 'grpc') {
        for (const m of ((cat?.methods ?? []) as Array<{ name: string }>)) out.push({ serviceId: e.id, label: m.name, sub: e.id });
      } else {
        for (const ep of ((cat?.endpoints ?? []) as Array<{ method: string; path: string }>)) out.push({ serviceId: e.id, label: `${ep.method} ${ep.path}`, sub: e.id });
      }
    }
    return out;
  }, [entries]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    const base = s ? items.filter((i) => i.label.toLowerCase().includes(s) || i.sub.toLowerCase().includes(s)) : items;
    return base.slice(0, 60);
  }, [items, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]" />
      <div className="relative z-10 w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.catalog.searchAll} className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">{t.common.noResults}</p>
          ) : filtered.map((i, idx) => (
            <button key={idx} onClick={() => { onOpen(i.serviceId); onClose(); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50">
              <span className="truncate font-mono text-[12px] text-slate-700">{i.label}</span>
              <span className="truncate text-[10px] text-slate-400">{i.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
