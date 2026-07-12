'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchSchedules,
  fetchTests,
  fetchSessions,
  createScheduleApi,
  updateScheduleApi,
  deleteScheduleApi,
  triggerScheduleApi,
  type ScheduleItem,
  type TestItem,
  type SessionItem,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import { SectionTabs } from '@/components/section-tabs';
import {
  Plus, Trash2, Play, Pencil, X, Loader2, Clock, Power, PowerOff, Search, RefreshCw,
} from 'lucide-react';

export default function SchedulesPage() {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<ScheduleItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchedules((await fetchSchedules()) ?? []);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (item: ScheduleItem) => {
    await updateScheduleApi(item.id, { enabled: !item.enabled });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.schedules.deleteConfirm)) return;
    await deleteScheduleApi(id);
    await load();
  };

  const handleTrigger = async (id: string) => {
    await triggerScheduleApi(id);
    setTimeout(load, 2000);
  };

  const handleSave = async (data: ScheduleFormData) => {
    if (editItem) {
      await updateScheduleApi(editItem.id, data);
    } else {
      await createScheduleApi(data);
    }
    setShowDialog(false);
    setEditItem(null);
    await load();
  };

  return (
    <div className="space-y-5">
      <SectionTabs active="schedules" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.nav.scheduledRuns}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {t.schedules.subtitle} · {schedules.length} {t.schedules.configured}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setEditItem(null); setShowDialog(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.schedules.newSchedule}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">{t.runCenter.schedulesEmptyTitle}</p>
            <p className="mt-1 text-xs text-slate-400">{t.runCenter.schedulesEmptyHint}</p>
            <button
              onClick={() => { setEditItem(null); setShowDialog(true); }}
              className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              {t.schedules.createFirst}
            </button>
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.schedules.name}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.schedules.cron}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.schedules.filter}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.session}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.status}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.schedules.lastRun}</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.schedules.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 group transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-[13px] font-medium text-slate-800">{item.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{item.id}</div>
                  </td>
                  <td className="px-5 py-3">
                    <code className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">{item.cron}</code>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.test_ids.length > 0 ? (
                        item.test_ids.map((id) => (
                          <span key={id} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 font-mono ring-1 ring-inset ring-blue-200">{id}</span>
                        ))
                      ) : (
                        <>
                          {item.tags.map((tag) => <span key={tag} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{tag}</span>)}
                          {item.tags.length === 0 && <span className="text-[10px] text-slate-400 italic">{t.schedules.allTests}</span>}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {item.session_id ? (
                      <span className="text-[11px] text-blue-600 font-mono truncate block max-w-[100px]" title={item.session_id}>{item.session_id.slice(0, 12)}...</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">{t.schedules.auto}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleToggle(item)}>
                      {item.enabled ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                          <Power className="h-2.5 w-2.5" /> {t.common.active}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-300/50">
                          <PowerOff className="h-2.5 w-2.5" /> {t.common.disabled}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[12px] text-slate-500">{item.last_run_at ? formatDate(item.last_run_at, localeStr) : '—'}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleTrigger(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title={t.schedules.triggerNow}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { setEditItem(item); setShowDialog(true); }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        title={t.common.edit}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title={t.common.delete}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showDialog && (
        <ScheduleDialog
          initial={editItem}
          onSave={handleSave}
          onClose={() => { setShowDialog(false); setEditItem(null); }}
        />
      )}
    </div>
  );
}

interface ScheduleFormData {
  name: string;
  cron: string;
  tags?: string[];
  test_ids?: string[];
  mode?: string;
  enabled?: boolean;
  notify_url?: string;
  rerun_on_fail?: boolean;
  max_reruns?: number;
  session_id?: string;
}

function ScheduleDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: ScheduleItem | null;
  onSave: (data: ScheduleFormData) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [cronExpr, setCronExpr] = useState(initial?.cron ?? '*/30 * * * *');
  const [tagsStr, setTagsStr] = useState(initial?.tags.join(', ') ?? '');
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set(initial?.test_ids ?? []));
  const mode = initial?.mode ?? 'real';
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [notifyUrl, setNotifyUrl] = useState(initial?.notify_url ?? '');
  const [rerunOnFail, setRerunOnFail] = useState(initial?.rerun_on_fail ?? false);
  const [maxReruns, setMaxReruns] = useState(initial?.max_reruns ?? 1);
  const [saving, setSaving] = useState(false);

  const [tests, setTests] = useState<TestItem[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [testSearch, setTestSearch] = useState('');

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState(initial?.session_id ?? '');
  const [scheduleTarget, setScheduleTarget] = useState<'tests' | 'session'>(initial?.session_id ? 'session' : 'tests');

  useEffect(() => {
    fetchTests()
      .then(setTests)
      .catch(() => setTests([]))
      .finally(() => setTestsLoading(false));
    fetchSessions({ limit: 200 })
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  const filteredTests = tests.filter((test) =>
    !testSearch || test.id.toLowerCase().includes(testSearch.toLowerCase()) || test.name.toLowerCase().includes(testSearch.toLowerCase()),
  );

  const toggleTest = (id: string) => {
    setSelectedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const switchToTests = () => {
    setScheduleTarget('tests');
    setSelectedSessionId('');
  };

  const switchToSession = () => {
    setScheduleTarget('session');
    setSelectedTestIds(new Set());
    setTagsStr('');
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const data: ScheduleFormData = {
        name,
        cron: cronExpr,
        mode,
        enabled,
        notify_url: notifyUrl || undefined,
        rerun_on_fail: rerunOnFail,
        max_reruns: rerunOnFail ? maxReruns : undefined,
      };

      if (scheduleTarget === 'session') {
        data.session_id = selectedSessionId || undefined;
      } else {
        const testIds = Array.from(selectedTestIds);
        data.test_ids = testIds.length > 0 ? testIds : undefined;
        data.tags = tagsStr ? tagsStr.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined;
      }

      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200/80 bg-white shadow-2xl animate-scaleIn">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">
            {initial ? t.schedules.editSchedule : t.schedules.newSchedule}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label={t.schedules.name}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Smoke tests every 30min" className={inputCls} />
          </Field>

          <Field label={t.schedules.cronExpression}>
            <input type="text" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="*/30 * * * *" className={`${inputCls} font-mono`} />
            <p className="mt-1 text-[11px] text-slate-400">{t.schedules.cronHint}</p>
          </Field>

          {/* Target selector: Tests or Session */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-1">
            <button
              type="button"
              onClick={switchToTests}
              className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${scheduleTarget === 'tests' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.schedules.selectTests}
            </button>
            <button
              type="button"
              onClick={switchToSession}
              className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${scheduleTarget === 'session' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.schedules.selectSession}
            </button>
          </div>

          {scheduleTarget === 'tests' ? (
            <>
              <Field label={t.schedules.testsSpecific}>
                {selectedTestIds.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {Array.from(selectedTestIds).map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                        {id}
                        <button type="button" onClick={() => toggleTest(id)} className="rounded p-0.5 hover:bg-blue-200 transition-colors">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    placeholder={t.common.search}
                    className={`${inputCls} !pl-8`}
                  />
                </div>
                {testsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> {t.schedules.loadingTests}
                  </div>
                ) : (
                  <div className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {filteredTests.map((test) => (
                      <label
                        key={test.id}
                        className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors ${selectedTestIds.has(test.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTestIds.has(test.id)}
                          onChange={() => toggleTest(test.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-slate-900 truncate">{test.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{test.id}</div>
                        </div>
                        {test.tags?.[0] && (
                          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">{test.tags[0]}</span>
                        )}
                      </label>
                    ))}
                    {filteredTests.length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-400 italic">{t.tests.noTestsFound}</p>
                    )}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-slate-400">
                  {selectedTestIds.size > 0
                    ? `${selectedTestIds.size} ${t.schedules.testSelectedIgnore}`
                    : t.schedules.leaveEmptyHint}
                </p>
              </Field>

              <Field label={t.schedules.tagsCommaSep}>
                <input type="text" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="grpc, order" className={inputCls} disabled={selectedTestIds.size > 0} />
              </Field>

              {selectedTestIds.size > 0 && (
                <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">{t.schedules.suiteTagsDisabled}</p>
              )}
            </>
          ) : (
            <Field label={t.tests.session}>
              {sessionsLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> {t.schedules.loadingSessions}
                </div>
              ) : (
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t.schedules.selectASession}</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} ({s.id.slice(0, 12)}...)</option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                {t.schedules.sessionRerunHint}
              </p>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label={t.common.enabled}>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                {enabled ? `● ${t.common.active}` : `○ ${t.common.disabled}`}
              </button>
            </Field>
          </div>

          {/* Rerun on fail */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t.schedules.rerunOnFail}>
              <button
                type="button"
                onClick={() => setRerunOnFail(!rerunOnFail)}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${rerunOnFail ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                {rerunOnFail ? `● ${t.common.enabled}` : `○ ${t.common.disabled}`}
              </button>
            </Field>
            {rerunOnFail && (
              <Field label={t.schedules.maxReruns}>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxReruns}
                  onChange={(e) => setMaxReruns(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                  className={inputCls}
                />
              </Field>
            )}
          </div>

          <Field label={t.schedules.webhookUrl}>
            <input type="text" value={notifyUrl} onChange={(e) => setNotifyUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." className={inputCls} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 ring-inset hover:bg-slate-50 transition-colors">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name || !cronExpr}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
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
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
