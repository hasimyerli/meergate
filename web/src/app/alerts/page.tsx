'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchAlertRules, createAlertRuleApi, updateAlertRuleApi, deleteAlertRuleApi,
  fetchAlertEvents, ackAlertEventApi, fetchTests, fetchSessions,
  type AlertRuleItem, type AlertEventItem, type AlertRuleForm, type AlertScope, type AlertCondition,
  type TestItem, type SessionItem,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import {
  Bell, Plus, Pencil, Trash2, RefreshCw, Loader2, Check, AlertTriangle, ShieldAlert, X,
  BellOff, Activity, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CONDITIONS: AlertCondition[] = ['run_failed', 'pass_rate_below', 'avg_duration_above', 'consecutive_failures', 'schema_drift'];
const SCOPES: AlertScope[] = ['all', 'test', 'session', 'environment'];
type EventFilter = 'open' | 'acknowledged' | 'all';

const SCOPE_BADGE: Record<AlertScope, string> = {
  all: 'bg-slate-100 text-slate-600',
  test: 'bg-blue-50 text-blue-700',
  session: 'bg-fuchsia-50 text-fuchsia-700',
  environment: 'bg-amber-50 text-amber-700',
};

export default function AlertsPage() {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const [rules, setRules] = useState<AlertRuleItem[]>([]);
  const [events, setEvents] = useState<AlertEventItem[]>([]);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<AlertRuleItem | null>(null);
  const [filter, setFilter] = useState<EventFilter>('open');
  const [view, setView] = useState<'incidents' | 'rules'>('incidents');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e, ts, ss] = await Promise.all([
        fetchAlertRules(),
        fetchAlertEvents({ limit: 100 }),
        fetchTests().catch(() => []),
        fetchSessions({ limit: 100 }).then((x) => x.sessions).catch(() => []),
      ]);
      setRules(r);
      setEvents(e.events);
      setTests(ts);
      setSessions(ss);
    } catch (err) {
      console.error('Alerts load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // KPIs
  const openCount = events.filter((e) => !e.acknowledged).length;
  const criticalCount = events.filter((e) => !e.acknowledged && e.severity === 'critical').length;
  const activeRules = rules.filter((r) => r.enabled).length;
  const mutedRules = rules.filter((r) => !r.enabled).length;

  // last-fired per rule
  const lastFired = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of events) {
      if (!m[e.rule_id] || e.created_at > m[e.rule_id]) m[e.rule_id] = e.created_at;
    }
    return m;
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (filter === 'open') return events.filter((e) => !e.acknowledged);
    if (filter === 'acknowledged') return events.filter((e) => e.acknowledged);
    return events;
  }, [events, filter]);

  const nameFor = (scope: AlertScope, value: string | null): string => {
    if (scope === 'all' || !value) return t.alerts.scopeAll;
    if (scope === 'test') return tests.find((x) => x.id === value)?.name ?? value;
    if (scope === 'session') return sessions.find((x) => x.id === value)?.label ?? value;
    return value;
  };
  const scopeTypeLabel = (s: AlertScope) => ({ all: t.alerts.scopeAll, test: t.alerts.scopeTest, session: t.alerts.scopeSession, environment: t.alerts.scopeEnvironment }[s]);
  const condLabel = (c: AlertCondition) => ({
    run_failed: t.alerts.condRunFailed,
    pass_rate_below: t.alerts.condPassRateBelow,
    avg_duration_above: t.alerts.condAvgDurationAbove,
    consecutive_failures: t.alerts.condConsecutiveFailures,
    schema_drift: t.alerts.condSchemaDrift,
  }[c]);
  const condSuffix = (c: AlertCondition) => (c === 'pass_rate_below' ? '%' : c === 'avg_duration_above' ? 'ms' : '');

  const ScopeBadge = ({ scope, value }: { scope: AlertScope; value: string | null }) => (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', SCOPE_BADGE[scope])}>
      {scope !== 'all' && <span className="opacity-60">{scopeTypeLabel(scope)}</span>}
      <span className="truncate max-w-[160px]">{nameFor(scope, value)}</span>
    </span>
  );

  const handleToggle = async (rule: AlertRuleItem) => { await updateAlertRuleApi(rule.id, { enabled: !rule.enabled }); load(); };
  const handleDelete = async (id: string) => { if (!confirm(t.alerts.deleteConfirm)) return; await deleteAlertRuleApi(id); load(); };
  const handleSave = async (data: AlertRuleForm) => {
    if (editItem) await updateAlertRuleApi(editItem.id, data);
    else await createAlertRuleApi(data);
    setShowDialog(false); setEditItem(null); load();
  };
  const handleAck = async (id: string) => { await ackAlertEventApi(id); load(); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.alerts.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{t.alerts.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" />
          </button>
          {view === 'rules' && (
            <button onClick={() => { setEditItem(null); setShowDialog(true); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" />{t.alerts.newRule}
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t.alerts.kpiOpen} value={openCount} icon={<Bell className="h-5 w-5 text-blue-600" />} />
        <Kpi label={t.alerts.kpiCritical} value={criticalCount} icon={<ShieldAlert className="h-5 w-5 text-red-500" />} accent={criticalCount > 0 ? 'text-red-600' : undefined} />
        <Kpi label={t.alerts.kpiActive} value={activeRules} icon={<Activity className="h-5 w-5 text-emerald-600" />} />
        <Kpi label={t.alerts.kpiMuted} value={mutedRules} icon={<BellOff className="h-5 w-5 text-slate-400" />} />
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(['incidents', 'rules'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn('relative px-4 py-2.5 text-sm font-medium transition-colors',
              view === v ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800')}
          >
            {v === 'incidents' ? t.alerts.tabIncidents : t.alerts.tabRules}
            {v === 'incidents' && openCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500/90 px-1.5 py-px text-[10px] font-bold text-white">{openCount}</span>
            )}
            {view === v && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : view === 'rules' ? (
        <div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {rules.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Bell className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">{t.alerts.noRules}</p>
                  <p className="text-xs text-slate-400">{t.alerts.noRulesHint}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="px-3 py-2.5 w-10">{t.alerts.status}</th>
                        <th className="px-3 py-2.5">{t.alerts.rule}</th>
                        <th className="px-3 py-2.5">{t.alerts.condition}</th>
                        <th className="px-3 py-2.5">{t.alerts.target}</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">{t.alerts.lastFired}</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rules.map((rule) => (
                        <tr key={rule.id} className="group hover:bg-slate-50/60">
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => handleToggle(rule)}
                              className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', rule.enabled ? 'bg-emerald-500' : 'bg-slate-300')}
                              title={rule.enabled ? t.common.active : t.alerts.muted}
                            >
                              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', rule.enabled ? 'left-4' : 'left-0.5')} />
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{rule.name}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                            {condLabel(rule.condition)}{rule.threshold != null ? ` ${rule.threshold}${condSuffix(rule.condition)}` : ''}
                          </td>
                          <td className="px-3 py-2.5"><ScopeBadge scope={rule.scope_type} value={rule.scope_value} /></td>
                          <td className="px-3 py-2.5 text-[12px] text-slate-500 whitespace-nowrap">
                            {lastFired[rule.id] ? formatDate(lastFired[rule.id], localeStr) : <span className="text-slate-300">{t.alerts.never}</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button onClick={() => { setEditItem(rule); setShowDialog(true); }} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDelete(rule.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
      ) : (
        <div>
            <div className="mb-2 flex items-center justify-end">
              <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
                {(['open', 'acknowledged', 'all'] as EventFilter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cn('rounded-md px-2.5 py-1 transition-colors', filter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                    {f === 'open' ? t.alerts.filterOpen : f === 'acknowledged' ? t.alerts.filterAcknowledged : t.alerts.filterAll}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {filteredEvents.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-slate-400">{t.alerts.noEvents}</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredEvents.map((ev) => {
                    const rule = rules.find((r) => r.id === ev.rule_id);
                    return (
                      <div key={ev.id} className={cn('px-4 py-3', ev.acknowledged && 'opacity-60')}>
                        <div className="flex items-start gap-2.5">
                          {ev.severity === 'critical'
                            ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                            : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-slate-800">{ev.rule_name}</span>
                              <span className={cn('rounded px-1 py-px text-[9px] font-bold uppercase', ev.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                                {ev.severity === 'critical' ? t.alerts.severityCritical : t.alerts.severityWarning}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{ev.message}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                              {rule && <ScopeBadge scope={rule.scope_type} value={rule.scope_value} />}
                              <span>{formatDate(ev.created_at, localeStr)}</span>
                              {ev.run_id && (
                                <Link href={`/runs/${encodeURIComponent(ev.run_id)}`} className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700">
                                  <ExternalLink className="h-3 w-3" />{t.alerts.viewRun}
                                </Link>
                              )}
                            </div>
                          </div>
                          {ev.acknowledged ? (
                            <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-400"><Check className="h-3 w-3" />{t.alerts.acknowledged}</span>
                          ) : (
                            <button onClick={() => handleAck(ev.id)} className="mt-0.5 shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50">{t.alerts.acknowledge}</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </div>
      )}

      {showDialog && (
        <AlertDialog initial={editItem} tests={tests} sessions={sessions}
          onClose={() => { setShowDialog(false); setEditItem(null); }} onSave={handleSave} />
      )}
    </div>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className="rounded-lg bg-slate-50 p-1.5">{icon}</div>
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', accent ?? 'text-slate-900')}>{value}</div>
    </div>
  );
}

function AlertDialog({ initial, tests, sessions, onClose, onSave }: {
  initial: AlertRuleItem | null;
  tests: TestItem[];
  sessions: SessionItem[];
  onClose: () => void;
  onSave: (data: AlertRuleForm) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [scopeType, setScopeType] = useState<AlertScope>(initial?.scope_type ?? 'all');
  const [scopeValue, setScopeValue] = useState(initial?.scope_value ?? '');
  const [condition, setCondition] = useState<AlertCondition>(initial?.condition ?? 'run_failed');
  const [threshold, setThreshold] = useState<string>(initial?.threshold != null ? String(initial.threshold) : '');
  const [windowN, setWindowN] = useState<string>(initial?.window_n != null ? String(initial.window_n) : '20');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const needsThreshold = condition !== 'run_failed' && condition !== 'schema_drift';
  const inputCls = 'w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none';

  const condLabel = (c: AlertCondition) => ({
    run_failed: t.alerts.condRunFailed, pass_rate_below: t.alerts.condPassRateBelow,
    avg_duration_above: t.alerts.condAvgDurationAbove, consecutive_failures: t.alerts.condConsecutiveFailures,
    schema_drift: t.alerts.condSchemaDrift,
  }[c]);
  const scopeLabel = (s: AlertScope) => ({ all: t.alerts.scopeAll, test: t.alerts.scopeTest, session: t.alerts.scopeSession, environment: t.alerts.scopeEnvironment }[s]);
  const thresholdLabel = condition === 'pass_rate_below' ? t.alerts.thresholdPercent : condition === 'avg_duration_above' ? t.alerts.thresholdMs : t.alerts.thresholdN;

  const canSave = name.trim() !== '' && (scopeType === 'all' || scopeValue.trim() !== '') && (!needsThreshold || threshold.trim() !== '');

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        scope_type: scopeType,
        scope_value: scopeType === 'all' ? null : scopeValue.trim(),
        condition,
        threshold: needsThreshold ? Number(threshold) : null,
        window_n: needsThreshold ? Number(windowN) || 20 : 20,
        enabled,
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{initial ? t.alerts.editRule : t.alerts.newRule}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <Field label={t.alerts.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Smoke test failures" />
          </Field>

          <Field label={t.alerts.condition}>
            <select value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)} className={inputCls}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {condLabel(c)}
                </option>
              ))}
            </select>
          </Field>

          {needsThreshold && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={thresholdLabel}><input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputCls} /></Field>
              <Field label={t.alerts.windowN}><input type="number" min={1} value={windowN} onChange={(e) => setWindowN(e.target.value)} className={inputCls} /></Field>
            </div>
          )}

          <Field label={t.alerts.scope}>
            <select value={scopeType} onChange={(e) => { setScopeType(e.target.value as AlertScope); setScopeValue(''); }} className={inputCls}>
              {SCOPES.map((s) => <option key={s} value={s}>{scopeLabel(s)}</option>)}
            </select>
          </Field>

          {scopeType === 'test' && (
            <Field label={t.alerts.scopeValue}>
              <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className={inputCls}>
                <option value="">{t.alerts.selectTest}</option>
                {tests.map((ts) => <option key={ts.id} value={ts.id}>{ts.name} ({ts.id})</option>)}
              </select>
            </Field>
          )}
          {scopeType === 'session' && (
            <Field label={t.alerts.scopeValue}>
              <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className={inputCls}>
                <option value="">{t.alerts.selectSession}</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          )}
          {scopeType === 'environment' && (
            <Field label={t.alerts.scopeValue}>
              <input value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className={inputCls} placeholder={t.alerts.environmentPlaceholder} />
            </Field>
          )}

          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
            {t.common.active}
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">{t.common.cancel}</button>
          <button onClick={submit} disabled={!canSave || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {initial ? t.common.update : t.common.create}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}
