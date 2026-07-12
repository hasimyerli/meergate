'use client';

import { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import {
  type DashboardConfig,
  ALL_KPIS,
  ALL_SECTIONS,
  DEFAULT_CONFIG,
} from '@/lib/dashboard-config';
import { useI18n } from '@/lib/i18n';

interface Props {
  config: DashboardConfig;
  onSave: (config: DashboardConfig) => void;
  onClose: () => void;
}

export function DashboardCustomizeDialog({ config, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [kpis, setKpis] = useState<string[]>([...config.kpis]);
  const [sections, setSections] = useState<string[]>([...config.sections]);

  const kpiLabels: Record<string, string> = {
    totalTests: t.dashboard.totalTests,
    runsToday: t.dashboard.runsToday,
    passRate: t.dashboard.passRate,
    activeSchedules: t.dashboard.activeSchedules,
    avgDuration: t.dashboard.avgDuration,
    flakyCount: t.dashboard.flakyTests,
    failedToday: t.dashboard.failedToday,
    runningNow: t.dashboard.runningNow,
  };

  const sectionLabels: Record<string, string> = {
    failingTests: t.dashboard.failingTests,
    sessions: t.nav.sessions,
    schedules: t.dashboard.activeSchedules,
  };

  const toggleKpi = (id: string) => {
    setKpis((prev) => prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]);
  };

  const toggleSection = (id: string) => {
    setSections((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const reset = () => {
    setKpis([...DEFAULT_CONFIG.kpis]);
    setSections([...DEFAULT_CONFIG.sections]);
  };

  const handleSave = () => {
    onSave({ kpis, sections });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl animate-scaleIn">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{t.dashboard.customizeDashboard}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* KPIs */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{t.dashboard.kpiCards}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_KPIS.map((kpi) => {
                const active = kpis.includes(kpi.id);
                return (
                  <button
                    key={kpi.id}
                    onClick={() => toggleKpi(kpi.id)}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-medium ${
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {kpiLabels[kpi.id] ?? kpi.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sections */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{t.dashboard.sidebarSections}</p>
            <div className="space-y-1.5">
              {ALL_SECTIONS.map((sec) => {
                const active = sections.includes(sec.id);
                return (
                  <button
                    key={sec.id}
                    onClick={() => toggleSection(sec.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium ${
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {sectionLabels[sec.id] ?? sec.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            <RotateCcw className="h-3 w-3" />
            {t.dashboard.resetToDefault}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
              {t.common.cancel}
            </button>
            <button onClick={handleSave} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              {t.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
