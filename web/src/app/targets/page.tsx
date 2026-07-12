'use client';

import { Boxes } from 'lucide-react';
import ServiceCatalog from '@/components/service-catalog';
import { useI18n } from '@/lib/i18n';

export default function ServiceCatalogPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100">
          <Boxes className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.nav.serviceCatalog}</h1>
          <p className="mt-1 text-sm text-slate-500">{t.catalog.pageSubtitle}</p>
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-5">
          <ServiceCatalog />
        </div>
      </div>
    </div>
  );
}
