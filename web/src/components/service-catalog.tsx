'use client';

import { useState, useEffect, useCallback, useMemo, Fragment, type ReactNode } from 'react';
import {
  fetchCatalog, syncAllCatalog, syncOneCatalog,
  addCatalogTarget, deleteCatalogTarget, importCatalog, discoverCatalogTarget,
  previewCatalogTarget, checkCatalogHealth, fetchCoverage,
  type CatalogEntry, type SyncReport, type PreviewResult, type ServiceCoverage,
} from '@/lib/api';
import {
  RefreshCw, Plus, Trash2, Upload, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Search, Pencil, Save, Activity,
  Layers,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { HealthDot, LatencyChip, DriftBadge } from '@/components/catalog-chips';
import { CatalogDetailDrawer } from '@/components/catalog-detail-drawer';
import { CatalogCommandPalette } from '@/components/catalog-command-palette';

/** Number of methods (gRPC) or endpoints (REST) discovered for an entry. */
function operationCount(entry: CatalogEntry): number {
  const catalog = entry.catalog as Record<string, unknown> | null;
  if (!catalog) return 0;
  if (entry.protocol === 'grpc') return ((catalog.methods ?? []) as unknown[]).length;
  return ((catalog.endpoints ?? []) as unknown[]).length;
}

export default function ServiceCatalog() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [filter, setFilter] = useState<'' | 'grpc' | 'rest'>('');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editEntry, setEditEntry] = useState<CatalogEntry | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [collapsedTargets, setCollapsedTargets] = useState<Set<string>>(new Set());
  const [syncingGroup, setSyncingGroup] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [coverage, setCoverage] = useState<Record<string, ServiceCoverage>>({});
  const [coverageTotals, setCoverageTotals] = useState<{ covered: number; total: number }>({ covered: 0, total: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCatalog(filter || undefined);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
    // Coverage is a best-effort overlay — never blocks the list.
    try {
      const cov = await fetchCoverage();
      const map: Record<string, ServiceCoverage> = {};
      for (const sc of cov.services) map[sc.id] = sc;
      setCoverage(map);
      setCoverageTotals({ covered: cov.covered_operations, total: cov.total_operations });
    } catch { /* coverage optional */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncReport(null);
    try {
      const report = await syncAllCatalog();
      setSyncReport(report);
      await load();
    } catch (err) {
      setSyncReport({ total: 0, synced: 0, failed: 0, errors: [{ id: 'sync', error: String(err) }] });
    } finally {
      setSyncing(false);
    }
  };

  const handleHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      await checkCatalogHealth();
      await load();
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleSyncOne = async (id: string) => {
    setSyncingId(id);
    try {
      await syncOneCatalog(id);
      await load();
    } catch {
      // error shown in sync_error column on reload
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete target "${id}"?`)) return;
    try {
      await deleteCatalogTarget(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert(`Delete failed: ${String(err)}`);
    }
  };

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.domain.toLowerCase().includes(q) ||
      e.target.toLowerCase().includes(q);
  });

  // Group entries by target so multiple services discovered at one host:port
  // collapse under a single header (single-entry targets render flat).
  const groups = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const e of filtered) {
      const arr = map.get(e.target) ?? [];
      arr.push(e);
      map.set(e.target, arr);
    }
    return Array.from(map.entries()).map(([target, items]) => ({ target, items }));
  }, [filtered]);

  const toggleGroup = (target: string) => {
    setCollapsedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target); else next.add(target);
      return next;
    });
  };

  const handleSyncGroup = async (target: string, items: CatalogEntry[]) => {
    setSyncingGroup(target);
    try {
      for (const item of items) {
        try { await syncOneCatalog(item.id); } catch { /* per-item error shows on reload */ }
      }
      await load();
    } finally {
      setSyncingGroup(null);
    }
  };

  const handleDeleteGroup = async (target: string, items: CatalogEntry[]) => {
    if (!confirm(`Delete all ${items.length} services at "${target}"?`)) return;
    try {
      await Promise.all(items.map((i) => deleteCatalogTarget(i.id)));
      setEntries((prev) => prev.filter((e) => e.target !== target));
    } catch (err) {
      alert(`Delete failed: ${String(err)}`);
      await load();
    }
  };

  const totalOperations = entries.reduce((sum, e) => sum + operationCount(e), 0);
  const healthyCount = entries.filter((e) => e.health_status === 'healthy').length;
  const unreachableCount = entries.filter((e) => e.health_status === 'unreachable').length;

  const drawerEntry = entries.find((e) => e.id === drawerId) ?? null;

  return (
    <div className="space-y-4">
      {/* Hero / summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <HeroStat icon={<Layers className="h-4 w-4 text-indigo-600" />} value={entries.length} label={t.catalog.totalServices} />
        <HeroStat icon={<Search className="h-4 w-4 text-slate-500" />} value={totalOperations} label={t.catalog.totalOperations} />
        <HeroStat
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          value={coverageTotals.total > 0 ? `${Math.round((coverageTotals.covered / coverageTotals.total) * 100)}%` : '—'}
          label={`${t.catalog.coverage} · ${coverageTotals.covered}/${coverageTotals.total}`}
        />
        <HeroStat
          icon={<span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="h-2 w-2 rounded-full bg-red-500" /></span>}
          value={`${healthyCount}/${unreachableCount}`}
          label={`${t.catalog.healthy} / ${t.catalog.unreachable}`}
        />
        <HeroStat icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} value={coverageTotals.total > 0 ? Math.max(0, coverageTotals.total - coverageTotals.covered) : '—'} label={t.catalog.riskyOperations} />
      </div>


      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSyncAll}
          disabled={syncing || entries.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t.catalog.syncAll}
        </button>
        <button
          onClick={handleHealthCheck}
          disabled={checkingHealth || entries.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {checkingHealth ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
          {t.catalog.checkHealth}
        </button>
        <button
          onClick={() => { setShowImport(true); setShowAddForm(false); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          {t.catalog.importJson}
        </button>
        <button
          onClick={() => { setShowAddForm(true); setEditEntry(null); setShowImport(false); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {t.catalog.connectService}
        </button>

        <div className="flex-1" />

        {/* Filter */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as '' | 'grpc' | 'rest')}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600"
        >
          <option value="">{t.catalog.allProtocols}</option>
          <option value="grpc">{t.catalog.grpcOnly}</option>
          <option value="rest">{t.catalog.restOnly}</option>
        </select>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common.search}
            className="rounded-lg border border-slate-200 py-1.5 pl-7 pr-3 text-xs text-slate-700 w-48 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Sync report */}
      {syncReport && (
        <div className={`rounded-lg border p-3 text-xs ${syncReport.failed > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="flex items-center gap-2">
            {syncReport.failed > 0
              ? <AlertTriangle className="h-4 w-4 text-amber-600" />
              : <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            }
            <span className="font-medium">
              {t.catalog.syncAll} {syncReport.synced}/{syncReport.total}
              {syncReport.failed > 0 && ` (${syncReport.failed} failed)`}
            </span>
          </div>
          {syncReport.errors && syncReport.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-amber-700">
              {syncReport.errors.slice(0, 5).map((e) => (
                <li key={e.id}><code>{e.id}</code>: {e.error}</li>
              ))}
              {syncReport.errors.length > 5 && <li>...and {syncReport.errors.length - 5} more</li>}
            </ul>
          )}
          <button onClick={() => setSyncReport(null)} className="mt-2 text-[11px] text-slate-500 underline">{t.common.dismiss}</button>
        </div>
      )}

      {/* Import form */}
      {showImport && (
        <ImportForm
          onImport={async (protocol, data) => {
            const result = await importCatalog(protocol, data);
            setShowImport(false);
            await load();
            return result.imported;
          }}
          onCancel={() => setShowImport(false)}
        />
      )}

      {/* Add / Edit target form */}
      {(showAddForm || editEntry) && (
        <AddTargetForm
          key={editEntry?.id ?? 'new'}
          initial={editEntry ?? undefined}
          onAdd={async (entry) => {
            const wasEdit = !!editEntry;
            await addCatalogTarget(entry);
            setShowAddForm(false);
            setEditEntry(null);
            // Re-sync after an edit so a fixed target/TLS takes effect immediately.
            if (wasEdit && entry.id) {
              try { await syncOneCatalog(entry.id); } catch { /* error shows in row */ }
            }
            await load();
          }}
          onPreview={(protocol, target, tls) => previewCatalogTarget(protocol, target, tls)}
          onDiscover={async (target, tls, services) => {
            const result = await discoverCatalogTarget(target, tls, services);
            setShowAddForm(false);
            setEditEntry(null);
            await load();
            return result.discovered;
          }}
          onCancel={() => { setShowAddForm(false); setEditEntry(null); }}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">
          {entries.length === 0
            ? t.catalog.noTargets
            : t.common.noResults}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-3 py-2 font-semibold text-slate-500 w-6" />
                <th className="px-3 py-2 font-semibold text-slate-500">{t.catalog.protocol}</th>
                <th className="px-3 py-2 font-semibold text-slate-500">{t.catalog.nameId}</th>
                <th className="px-3 py-2 font-semibold text-slate-500">{t.catalog.target}</th>
                <th className="px-3 py-2 font-semibold text-slate-500">{t.catalog.domain}</th>
                <th className="px-3 py-2 font-semibold text-slate-500">{t.catalog.syncStatus}</th>
                <th className="px-3 py-2 font-semibold text-slate-500 text-right">{t.schedules.actions}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const rowProps = (entry: CatalogEntry, indent = false) => ({
                  entry,
                  indent,
                  onOpen: () => { if (entry.catalog) setDrawerId(entry.id); },
                  onSync: () => handleSyncOne(entry.id),
                  onEdit: () => { setEditEntry(entry); setShowAddForm(false); setShowImport(false); },
                  onDelete: () => handleDelete(entry.id),
                  syncing: syncingId === entry.id,
                });

                if (g.items.length === 1) {
                  return <CatalogRow key={g.items[0].id} {...rowProps(g.items[0])} />;
                }

                const collapsed = collapsedTargets.has(g.target);
                const proto = g.items[0].protocol;
                const okCount = g.items.filter((e) => e.synced_at && !e.sync_error).length;
                const errCount = g.items.filter((e) => !!e.sync_error).length;
                const groupHealthy = g.items.filter((e) => e.health_status === 'healthy').length;
                const groupUnreachable = g.items.filter((e) => e.health_status === 'unreachable').length;
                return (
                  <Fragment key={g.target}>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <td className="px-3 py-2">
                        <button onClick={() => toggleGroup(g.target)} className="text-slate-400 hover:text-slate-600">
                          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${proto === 'grpc' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{proto}</span>
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-slate-700 truncate max-w-[300px]" title={g.target}>{g.target}</td>
                      <td className="px-3 py-2 text-slate-400">
                        {g.items.length} {t.catalog.servicesCount}
                        <span className="text-slate-300"> · </span>
                        {g.items.reduce((s, e) => s + operationCount(e), 0)} {t.catalog.totalOperations}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-400">
                        {groupHealthy > 0 && <span className="text-emerald-600 mr-2">{groupHealthy} ● </span>}
                        {groupUnreachable > 0 && <span className="text-red-600">{groupUnreachable} ●</span>}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {okCount > 0 && <span className="text-emerald-600">{okCount} {t.catalog.syncedStatus}</span>}
                        {errCount > 0 && <span className="ml-2 text-red-600">{errCount} {t.catalog.syncError}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => handleSyncGroup(g.target, g.items)} disabled={syncingGroup === g.target} className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50" title={t.catalog.syncAll}>
                            {syncingGroup === g.target ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={() => handleDeleteGroup(g.target, g.items)} className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-600" title={t.catalog.deleteTarget}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {!collapsed && g.items.map((entry) => <CatalogRow key={entry.id} {...rowProps(entry, true)} />)}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-slate-400">
          <span>{totalOperations} {t.catalog.operationsDiscovered}</span>
          <span className="text-slate-300">·</span>
          <button onClick={() => setPaletteOpen(true)} className="inline-flex items-center gap-1 hover:text-slate-600">
            <kbd className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">⌘K</kbd> {t.catalog.searchAll}
          </button>
        </div>
      )}

      {drawerEntry && (
        <CatalogDetailDrawer entry={drawerEntry} coverage={coverage[drawerEntry.id]} onClose={() => setDrawerId(null)} />
      )}

      {paletteOpen && (
        <CatalogCommandPalette entries={entries} onOpen={(id) => setDrawerId(id)} onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  );
}

function HeroStat({ icon, value, label }: { icon: ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800">{value}</div>
        <div className="truncate text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      </div>
    </div>
  );
}

function CatalogRow({ entry, onOpen, onSync, onEdit, onDelete, syncing, indent }: {
  entry: CatalogEntry;
  onOpen: () => void;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
  syncing: boolean;
  indent?: boolean;
}) {
  const { t } = useI18n();
  const hasCatalog = !!entry.catalog;
  const hasError = !!entry.sync_error;

  return (
    <tr
      className={`group border-b border-slate-100 transition-colors ${hasCatalog ? 'cursor-pointer hover:bg-indigo-50/40' : 'hover:bg-slate-50/50'}`}
      onClick={onOpen}
      title={hasCatalog ? t.catalog.openDetail : undefined}
    >
      <td className={`px-3 py-2 ${indent ? 'pl-8 border-l-2 border-slate-200' : ''}`}>
        {hasCatalog ? <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-indigo-500" /> : <span className="inline-block w-3.5" />}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
          entry.protocol === 'grpc' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {entry.protocol}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <HealthDot status={entry.health_status} />
          <span className="font-medium text-slate-800">{entry.name}</span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[300px]" title={entry.id}>{entry.id}</div>
        {entry.drift_summary && <div className="mt-0.5"><DriftBadge summary={entry.drift_summary} /></div>}
      </td>
      <td className="px-3 py-2 text-slate-600 font-mono truncate max-w-[200px]" title={entry.target}>{entry.target}</td>
      <td className="px-3 py-2 text-slate-500">{entry.domain || '—'}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {hasError ? (
            <span className="inline-flex items-center gap-1 text-red-600" title={entry.sync_error ?? ''}>
              <XCircle className="h-3.5 w-3.5" /> {t.catalog.syncError}
            </span>
          ) : entry.synced_at ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t.catalog.syncedStatus}
            </span>
          ) : (
            <span className="text-slate-400">{t.catalog.notSynced}</span>
          )}
          <LatencyChip ms={entry.latency_ms} />
        </div>
      </td>
      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center gap-1">
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            title={t.catalog.syncThis}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onEdit}
            className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title={t.catalog.editTarget}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-600"
            title={t.catalog.deleteTarget}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ImportForm({ onImport, onCancel }: {
  onImport: (protocol: string, data: Record<string, unknown>) => Promise<number>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [protocol, setProtocol] = useState<'grpc' | 'rest'>('grpc');
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const handleSubmit = async () => {
    setError('');
    setResult(null);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError(t.catalog.invalidJson);
      return;
    }

    // Strip $ and _ prefixed keys (comments in grpc-targets.json)
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.startsWith('$') && !k.startsWith('_')) {
        cleaned[k] = v;
      }
    }

    if (Object.keys(cleaned).length === 0) {
      setError(t.catalog.noValidEntries);
      return;
    }

    setImporting(true);
    try {
      const count = await onImport(protocol, cleaned);
      setResult(count);
      setJsonText('');
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-800">{t.catalog.importTargets}</h3>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">{t.common.cancel}</button>
      </div>

      <p className="text-[11px] text-slate-500">
        {t.catalog.importHint}
      </p>

      <div className="flex items-center gap-3">
        <label className="text-[10px] font-semibold uppercase text-slate-400">{t.catalog.protocol}</label>
        <select
          value={protocol}
          onChange={(e) => setProtocol(e.target.value as 'grpc' | 'rest')}
          className="rounded border border-slate-200 px-2 py-1 text-xs"
        >
          <option value="grpc">gRPC</option>
          <option value="rest">REST</option>
        </select>
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder={protocol === 'grpc'
          ? '{\n  "proto.balance.v1.BalanceService": {\n    "target": "balance-query:443",\n    "tls": true\n  }\n}'
          : '{\n  "order-api": {\n    "base_url": "https://api.example.com",\n    "swagger_url": "/swagger/v1/swagger.json",\n    "domain": "order"\n  }\n}'
        }
        rows={8}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
      {result !== null && (
        <p className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> {t.catalog.importedSuccess.replace('{count}', String(result))}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={importing || !jsonText.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {t.common.import}
      </button>
    </div>
  );
}

function AddTargetForm({ onAdd, onDiscover, onPreview, onCancel, initial }: {
  onAdd: (entry: Partial<CatalogEntry>) => Promise<void>;
  onDiscover: (target: string, tls: boolean, services: string[]) => Promise<number>;
  onPreview: (protocol: string, target: string, tls: boolean) => Promise<PreviewResult>;
  onCancel: () => void;
  initial?: CatalogEntry;
}) {
  const { t } = useI18n();
  const isEdit = !!initial;
  const initCfg = (initial?.config ?? {}) as { tls?: boolean; swagger_url?: string };
  const [protocol, setProtocol] = useState<'grpc' | 'rest'>((initial?.protocol as 'grpc' | 'rest') ?? 'grpc');
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial?.target ?? '');
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [tls, setTls] = useState(initCfg.tls ?? true);
  const [swaggerUrl, setSwaggerUrl] = useState(initCfg.swagger_url ?? '');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // gRPC "add" discovers every service at a host:port via reflection — no FQN
  // needed. Editing an existing gRPC entry keeps the manual fields.
  const isDiscover = protocol === 'grpc' && !isEdit;

  const handleSubmit = async () => {
    setError('');
    if (!id || !target) {
      setError(t.catalog.idRequired);
      return;
    }

    const config = protocol === 'grpc'
      ? { tls }
      : { swagger_url: swaggerUrl };

    setAdding(true);
    try {
      await onAdd({ id, protocol, name: name || id, target, domain, config });
    } catch (err) {
      setError(String(err));
    } finally {
      setAdding(false);
    }
  };

  const handlePreview = async () => {
    setError('');
    if (!target.trim()) { setError(t.catalog.idRequired); return; }
    setAdding(true);
    try {
      const res = await onPreview('grpc', target.trim(), tls);
      setPreview(res);
      setTls(res.tls); // reflect the auto-detected transport (TLS vs plaintext)
      setSelected(new Set((res.services ?? []).map((s) => s.fqn)));
    } catch (err) {
      setError(String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleAddSelected = async () => {
    setError('');
    setAdding(true);
    try {
      await onDiscover(target.trim(), tls, Array.from(selected));
    } catch (err) {
      setError(String(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-800">{isEdit ? t.catalog.editServiceTarget : t.catalog.addServiceTarget}</h3>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">{t.common.cancel}</button>
      </div>

      {/* Protocol (always shown; locked while editing) */}
      <div>
        <label className="text-[10px] font-semibold uppercase text-slate-400">{t.catalog.protocol}</label>
        <select
          value={protocol}
          onChange={(e) => setProtocol(e.target.value as 'grpc' | 'rest')}
          disabled={isEdit}
          className="mt-1 w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="grpc">gRPC</option>
          <option value="rest">REST</option>
        </select>
      </div>

      {isDiscover ? (
        /* gRPC add: enter host:port → preview services → add selected */
        <>
          <p className="text-[11px] text-slate-500">{t.catalog.discoverHint}</p>
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-400">{t.catalog.target} ({t.catalog.hostPort})</label>
            <input
              value={target}
              onChange={(e) => { setTarget(e.target.value); setPreview(null); }}
              placeholder="grpcb.in:9000"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={tls} onChange={(e) => setTls(e.target.checked)} className="rounded border-slate-300" id="tls-discover" />
            <label htmlFor="tls-discover" className="text-xs text-slate-600">{t.catalog.tlsPreferred}</label>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}

          {!preview ? (
            <button
              onClick={handlePreview}
              disabled={adding || !target.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {t.catalog.discoverApiSurface}
            </button>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700">
                  {(preview.services ?? []).length} {t.catalog.servicesCount} · {preview.tls ? t.catalog.viaTls : t.catalog.viaPlaintext}
                </span>
                <button
                  onClick={() => setSelected((prev) => prev.size === (preview.services ?? []).length ? new Set() : new Set((preview.services ?? []).map((s) => s.fqn)))}
                  className="text-[11px] text-blue-600 hover:text-blue-700"
                >
                  {selected.size === (preview.services ?? []).length ? t.sessions.deselectAll : t.sessions.selectAll}
                </button>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {(preview.services ?? []).map((s) => (
                  <label key={s.fqn} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(s.fqn)}
                      onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(s.fqn)) n.delete(s.fqn); else n.add(s.fqn); return n; })}
                      className="rounded border-slate-300"
                    />
                    <span className="flex-1 truncate font-mono text-[11px] text-slate-700" title={s.fqn}>{s.fqn}</span>
                    <span className="text-[10px] text-slate-400">{s.method_count} {t.catalog.methodsShort}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={handleAddSelected}
                disabled={adding || selected.size === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {t.catalog.addSelected.replace('{count}', String(selected.size))}
              </button>
            </div>
          )}
        </>
      ) : (
        /* REST add, or editing an existing entry: manual fields */
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase text-slate-400">{t.catalog.domain}</label>
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. order" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-slate-400">{t.catalog.nameLabel}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Human-readable name" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-semibold uppercase text-slate-400">
                {t.catalog.idLabel} {protocol === 'grpc' ? `(${t.catalog.serviceFqn})` : `(${t.catalog.slug})`}
              </label>
              <input value={id} onChange={(e) => setId(e.target.value)} readOnly={isEdit} placeholder={protocol === 'grpc' ? 'proto.balance.v1.BalanceService' : 'order-api'} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none read-only:bg-slate-50 read-only:text-slate-500" />
              {isEdit && <p className="mt-1 text-[10px] text-slate-400">{t.catalog.idReadOnly}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-semibold uppercase text-slate-400">
                {t.catalog.target} {protocol === 'grpc' ? `(${t.catalog.hostPort})` : '(Base URL)'}
              </label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={protocol === 'grpc' ? 'balance-query:443' : 'https://api.example.com'} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none" />
            </div>
            {protocol === 'grpc' ? (
              <div className="flex items-center gap-2 col-span-2">
                <input type="checkbox" checked={tls} onChange={(e) => setTls(e.target.checked)} className="rounded border-slate-300" id="tls-check" />
                <label htmlFor="tls-check" className="text-xs text-slate-600">{t.catalog.tlsEnabled}</label>
              </div>
            ) : (
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase text-slate-400">{t.catalog.swaggerUrl}</label>
                <input value={swaggerUrl} onChange={(e) => setSwaggerUrl(e.target.value)} placeholder="/swagger/v1/swagger.json" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none" />
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={handleSubmit} disabled={adding} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {isEdit ? t.common.save : t.catalog.addTarget}
          </button>
        </>
      )}
    </div>
  );
}
