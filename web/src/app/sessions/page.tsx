'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchSessions, createSessionApi, updateSessionApi, deleteSessionApi,
  type SessionItem,
} from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatDuration } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';
import { SectionTabs } from '@/components/section-tabs';
import {
  Plus, Trash2, Pencil, Loader2, X, FolderOpen, GitBranch, Tag, User, Globe, RefreshCw,
} from 'lucide-react';

export default function SessionsPage() {
  const { t } = useI18n();
  const localeStr = useLocaleString();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editSession, setEditSession] = useState<SessionItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { sessions: data } = await fetchSessions({ limit: 100 });
      setSessions(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm(t.sessions.deleteConfirm)) return;
    try {
      await deleteSessionApi(id);
      await load();
    } catch (err) {
      alert(`${t.sessions.failedToDelete}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSaved = () => {
    setShowDialog(false);
    setEditSession(null);
    load();
  };

  return (
    <div className="space-y-5">
      <SectionTabs active="sessions" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.nav.validationSessions}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {t.sessions.subtitle}
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
            onClick={() => { setEditSession(null); setShowDialog(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.sessions.newSession}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">{t.runCenter.sessionsEmptyTitle}</p>
            <p className="mt-1 text-xs text-slate-400">{t.runCenter.sessionsEmptyHint}</p>
            <button
              onClick={() => { setEditSession(null); setShowDialog(true); }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.sessions.createSession}
            </button>
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.label}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.environment}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.git}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.jira}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.common.runs}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.results}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.tests.duration}</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.sessions.created}</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => {
                const sum = s.summary;
                return (
                  <tr key={s.id} className="hover:bg-slate-50 group transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/sessions/${s.id}`} className="group/link">
                        <div className="text-[13px] font-medium text-blue-600 group-hover/link:underline truncate max-w-[220px]">{s.label}</div>
                        {s.created_by && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
                            <User className="h-3 w-3" />{s.created_by}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {s.environment ? (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600">
                          <Globe className="h-3 w-3" />{s.environment}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {s.git_ref ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                          <GitBranch className="h-3 w-3 text-slate-400" />
                          <span className="font-mono truncate max-w-[120px]">{s.git_ref}</span>
                          {s.git_commit && (
                            <span className="text-slate-400 font-mono">@{s.git_commit.slice(0, 7)}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {s.jira_ref ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
                          <Tag className="h-2.5 w-2.5" />{s.jira_ref}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="text-[13px] font-semibold text-slate-900">{sum?.total ?? 0}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {sum && sum.total > 0 ? (
                        <div className="flex items-center gap-1.5">
                          {sum.passed > 0 && <StatusBadge status="passed" size="xs" label={String(sum.passed)} />}
                          {sum.failed > 0 && <StatusBadge status="failed" size="xs" label={String(sum.failed)} />}
                          {sum.error > 0 && <StatusBadge status="error" size="xs" label={String(sum.error)} />}
                          {sum.running > 0 && <StatusBadge status="running" size="xs" label={String(sum.running)} />}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-300">{t.sessions.noRuns}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="text-[12px] font-mono font-semibold text-slate-700">{formatDuration(sum?.duration_ms)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="text-[12px] text-slate-500">{formatDate(s.created_at, localeStr)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditSession(s); setShowDialog(true); }}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title={t.common.edit}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title={t.common.delete}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showDialog && (
        <SessionDialog
          initial={editSession}
          onClose={() => { setShowDialog(false); setEditSession(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function SessionDialog({ initial, onClose, onSaved }: { initial: SessionItem | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const isEdit = !!initial;
  const parseRunTags = (tags: string[] | null | undefined) => Array.isArray(tags) ? tags.join(', ') : '';

  const [label, setLabel] = useState(initial?.label ?? '');
  const [environment, setEnvironment] = useState(initial?.environment ?? '');
  const [gitRef, setGitRef] = useState(initial?.git_ref ?? '');
  const [gitCommit, setGitCommit] = useState(initial?.git_commit ?? '');
  const [jiraRef, setJiraRef] = useState(initial?.jira_ref ?? '');
  const [createdBy, setCreatedBy] = useState(initial?.created_by ?? '');
  const [runTags, setRunTags] = useState(parseRunTags(initial?.run_tags));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const data = {
        label: label.trim(),
        environment: environment.trim() || undefined,
        git_ref: gitRef.trim() || undefined,
        git_commit: gitCommit.trim() || undefined,
        jira_ref: jiraRef.trim() || undefined,
        created_by: createdBy.trim() || undefined,
        run_tags: runTags.trim() ? runTags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
      };
      if (isEdit) {
        await updateSessionApi(initial.id, data);
      } else {
        await createSessionApi(data);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200/80 bg-white shadow-2xl animate-scaleIn">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">
            {isEdit ? t.sessions.editSession : t.sessions.newSession}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t.sessions.label} *</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. v2.4.1 staging regression" className={inputCls} />
          </div>
          <Field label={t.sessions.environment} placeholder="local, staging, production" value={environment} onChange={setEnvironment} />
          <Field label={t.sessions.gitBranch} placeholder="e.g. release/2.4.1" value={gitRef} onChange={setGitRef} />
          <Field label={t.sessions.gitCommit} placeholder="e.g. a1b2c3d" value={gitCommit} onChange={setGitCommit} />
          <Field label={t.sessions.jiraRef} placeholder="e.g. ORDER-1234" value={jiraRef} onChange={setJiraRef} />
          <Field label={t.sessions.createdBy} placeholder="e.g. hasim" value={createdBy} onChange={setCreatedBy} />
          <Field label={t.sessions.tags} placeholder="comma separated: release, pre-deploy" value={runTags} onChange={setRunTags} />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 ring-inset hover:bg-slate-50 transition-colors">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !label.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? t.common.update : t.common.create}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-slate-300"
      />
    </div>
  );
}
