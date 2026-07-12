'use client';

import { useState, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HealthDot } from '@/components/catalog-chips';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn, tkey, formatDate } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import { gateStatusColor, GATE_STATUS_LABEL, serviceCoveragePct, coverageHasTests, type GateStatus } from '@/lib/gate-status';
import type { CatalogEntry, GateSummary, CoverageReport } from '@/lib/api';

const GROUP_RANK: Record<GateStatus, number> = { blocked: 0, watch: 1, evaluating: 2, ready: 3, no_baseline: 4, not_configured: 5 };

/**
 * The service release board — services (grouped by discovery target) with their
 * gate status, candidate, baseline, regressions, coverage, health and actions.
 * Shared by the Release Gates landing and the Home overview.
 */
export function ServiceGateBoard({
  services, gates, coverage, onNewRelease,
}: {
  services: CatalogEntry[];
  gates: Record<string, GateSummary>;
  coverage: CoverageReport | null;
  onNewRelease: (serviceId: string) => void;
}) {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const m = new Map<string, CatalogEntry[]>();
    for (const s of services) { const a = m.get(s.target) ?? []; a.push(s); m.set(s.target, a); }
    return Array.from(m.entries()).map(([target, items]) => ({ target, items }));
  }, [services]);

  const statusOf = (svc: CatalogEntry): GateStatus =>
    gates[svc.id]?.status ?? (coverageHasTests(coverage, svc.id) ? 'no_baseline' : 'not_configured');
  const groupStatus = (items: CatalogEntry[]): GateStatus =>
    items.map(statusOf).sort((a, b) => GROUP_RANK[a] - GROUP_RANK[b])[0] ?? 'not_configured';
  const toggle = (target: string) => setCollapsed((p) => { const n = new Set(p); if (n.has(target)) n.delete(target); else n.add(target); return n; });
  const protoBadge = (proto: string) => cn('rounded px-1 py-0.5 text-[9px] font-semibold uppercase', proto === 'grpc' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700');

  const renderRow = (svc: CatalogEntry, indent: boolean) => {
    const g = gates[svc.id];
    const status = statusOf(svc);
    const color = gateStatusColor(status);
    const covPct = serviceCoveragePct(coverage, svc.id);
    const newReg = g?.counts.new_regressions ?? null;
    return (
      <tr key={svc.id} onClick={() => router.push(`/release-gates/${encodeURIComponent(svc.id)}`)} className="cursor-pointer hover:bg-slate-50/60">
        <td className={cn('px-4 py-3', indent && 'pl-9')}>
          <div className="flex items-center gap-1.5">
            <span className={protoBadge(svc.protocol)}>{svc.protocol}</span>
            <span className="font-medium text-slate-800">{svc.name || svc.id}</span>
          </div>
          {!indent && <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400" title={svc.target}>{svc.target}</div>}
        </td>
        <td className="px-3 py-3">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', color.bg, color.text, color.ring)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', color.dot)} />
            {tkey(t, GATE_STATUS_LABEL[status])}
          </span>
        </td>
        <td className="px-3 py-3 text-slate-600">
          {g?.candidate ? (g.candidate.label || g.candidate.target_version || g.candidate.id.slice(0, 10)) : <span className="text-slate-400">{t.releaseGates.noActiveRelease}</span>}
        </td>
        <td className="px-3 py-3 text-slate-600">
          {g?.baseline ? (g.baseline.label || g.baseline.id.slice(0, 10)) : <span className="text-slate-400">{t.releaseGates.noBaselineShort}</span>}
        </td>
        <td className="px-3 py-3">
          {newReg == null ? <span className="text-slate-400">{t.releaseGates.notEvaluatedShort}</span>
            : newReg > 0 ? <span className="font-semibold text-red-600">{tkey(t, 'releaseGates.newCount', { count: newReg })}</span>
              : <span className="text-emerald-600">0</span>}
        </td>
        <td className="px-3 py-3">
          {covPct == null ? <span className="text-slate-300">—</span>
            : <span className={cn('font-medium', covPct >= 70 ? 'text-slate-700' : covPct >= 35 ? 'text-amber-600' : 'text-red-600')}>{covPct}%</span>}
        </td>
        <td className="px-3 py-3"><HealthDot status={svc.health_status} /></td>
        <td className="px-3 py-3 text-[12px] text-slate-500">
          {g?.last_evaluated_at ? formatDate(g.last_evaluated_at, localeStr) : '—'}
        </td>
        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-2">
            <button onClick={() => onNewRelease(svc.id)} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">{t.releaseGates.newRelease}</button>
            <Link href={`/release-gates/${encodeURIComponent(svc.id)}`} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-800">
              {t.releaseGates.openGate}<ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2.5">{t.releaseGates.colService}</th>
            <th className="px-3 py-2.5">{t.releaseGates.colGateStatus}</th>
            <th className="px-3 py-2.5">{t.releaseGates.colCandidate}</th>
            <th className="px-3 py-2.5">{t.releaseGates.colBaseline}</th>
            <th className="px-3 py-2.5">{t.releaseGates.colRegressions}</th>
            <th className="px-3 py-2.5">{t.releaseGates.colCoverage}</th>
            <th className="px-3 py-2.5">{t.releaseGates.colHealth}</th>
            <th className="px-3 py-2.5">{t.releaseGates.colLastEval}</th>
            <th className="px-3 py-2.5 text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {groups.map((grp) => {
            if (grp.items.length === 1) return renderRow(grp.items[0], false);
            const isCollapsed = collapsed.has(grp.target);
            const gs = groupStatus(grp.items);
            const gc = gateStatusColor(gs);
            return (
              <Fragment key={grp.target}>
                <tr className="cursor-pointer border-b border-slate-100 bg-slate-50/70 hover:bg-slate-100/60" onClick={() => toggle(grp.target)}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                      <span className={protoBadge(grp.items[0].protocol)}>{grp.items[0].protocol}</span>
                      <span className="font-mono text-[12px] font-medium text-slate-700">{grp.target}</span>
                      <span className="text-[11px] text-slate-400">{grp.items.length} {t.catalog.servicesCount}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', gc.bg, gc.text, gc.ring)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', gc.dot)} />
                      {tkey(t, GATE_STATUS_LABEL[gs])}
                    </span>
                  </td>
                  <td colSpan={7} />
                </tr>
                {!isCollapsed && grp.items.map((svc) => renderRow(svc, true))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
