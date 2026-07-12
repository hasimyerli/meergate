'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchCatalog, fetchGates, fetchCoverage,
  type CatalogEntry, type GateSummary, type CoverageReport,
} from '@/lib/api';
import { NewReleaseModal } from '@/components/new-release-modal';
import { ServiceGateBoard } from '@/components/service-gate-board';
import { ShieldCheck, Rocket, Boxes, Search, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function ReleaseGatesLanding() {
  const { t } = useI18n();
  const [services, setServices] = useState<CatalogEntry[]>([]);
  const [gates, setGates] = useState<Record<string, GateSummary>>({});
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalService, setModalService] = useState<string | null | undefined>(undefined); // undefined = closed

  const load = useCallback(async () => {
    setLoading(true);
    const [cat, g, cov] = await Promise.allSettled([fetchCatalog(), fetchGates(), fetchCoverage()]);
    setServices(cat.status === 'fulfilled' ? cat.value : []);
    setGates(g.status === 'fulfilled' ? g.value : {});
    setCoverage(cov.status === 'fulfilled' ? cov.value : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only services that actually have a release gate (a candidate or baseline).
  // New services get a gate via "New Release" — not by being in the catalog.
  const gated = useMemo(() => services.filter((s) => gates[s.id]), [services, gates]);

  const filtered = useMemo(() => {
    if (!search) return gated;
    const q = search.toLowerCase();
    return gated.filter((s) => (s.name || s.id).toLowerCase().includes(q) || s.target.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q));
  }, [gated, search]);

  const openModal = (serviceId?: string) => setModalService(serviceId ?? null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900">
            <ShieldCheck className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.releaseGates.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{t.releaseGates.landingSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/targets" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Boxes className="h-4 w-4" />{t.releaseGates.openServiceCatalog}
          </Link>
          <button onClick={() => openModal()} disabled={services.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            <Rocket className="h-4 w-4" />{t.releaseGates.newRelease}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
          <Boxes className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">{t.releaseGates.emptyNoServicesTitle}</p>
          <p className="mt-1 text-[13px] text-slate-400">{t.releaseGates.emptyNoServicesDesc}</p>
          <Link href="/targets" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
            {t.releaseGates.openServiceCatalog}<ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : gated.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-slate-300" strokeWidth={1.75} />
          <p className="mt-3 text-sm font-medium text-slate-600">{t.releaseGates.emptyNoGatesTitle}</p>
          <p className="mt-1 text-[13px] text-slate-400">{t.releaseGates.emptyNoGatesDesc}</p>
          <button onClick={() => openModal()} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            <Rocket className="h-4 w-4" />{t.releaseGates.newRelease}
          </button>
        </div>
      ) : (
        <>
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.releaseGates.searchService}
              className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-[13px] focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <ServiceGateBoard services={filtered} gates={gates} coverage={coverage} onNewRelease={openModal} />
        </>
      )}

      {modalService !== undefined && (
        <NewReleaseModal
          services={services}
          coverage={coverage}
          preselectedServiceId={modalService ?? undefined}
          onClose={() => setModalService(undefined)}
        />
      )}
    </div>
  );
}
