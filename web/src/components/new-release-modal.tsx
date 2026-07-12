'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, Rocket, FlaskConical } from 'lucide-react';
import {
  createCandidate, evaluateCandidate,
  type CatalogEntry, type CoverageReport, type CandidateInput,
} from '@/lib/api';
import { cn, tkey } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/** Union of test ids protecting a service, derived from the coverage report. */
function gateTestCount(coverage: CoverageReport | null, serviceId: string): number {
  if (!coverage) return 0;
  const svc = coverage.services.find((s) => s.id === serviceId);
  if (!svc) return 0;
  const ids = new Set<string>();
  for (const op of svc.operations ?? []) for (const t of op.test_ids ?? []) ids.add(t);
  return ids.size;
}

export function NewReleaseModal({
  services, coverage, preselectedServiceId, onClose,
}: {
  services: CatalogEntry[];
  coverage: CoverageReport | null;
  preselectedServiceId?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [serviceId, setServiceId] = useState(preselectedServiceId ?? '');
  const [form, setForm] = useState<CandidateInput>({ environment: 'staging' });
  const [runAfter, setRunAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const scopeCount = useMemo(() => gateTestCount(coverage, serviceId), [coverage, serviceId]);
  const selected = services.find((s) => s.id === serviceId) ?? null;

  const set = (k: keyof CandidateInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!serviceId) { setError(t.releaseGates.selectServiceHint); return; }
    setBusy(true);
    setError('');
    try {
      const candidate = await createCandidate(serviceId, form);
      if (runAfter) {
        try { await evaluateCandidate(candidate.id); } catch { /* detail page shows the result/error */ }
      }
      // Navigate to the gate, then close the modal. Closing matters when the
      // modal was opened from the same gate route (push would be a no-op and
      // otherwise leave the button stuck in its loading state).
      router.push(`/release-gates/${encodeURIComponent(serviceId)}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={busy ? undefined : onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-800">{t.releaseGates.newRelease}</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Step 1 — service */}
          <section>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.releaseGates.selectService}</div>
            <p className="mb-2 text-[12px] text-slate-500">{t.releaseGates.selectServiceHint}</p>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={!!preselectedServiceId}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] disabled:bg-slate-50"
            >
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.id} ({s.protocol})</option>
              ))}
            </select>
            {selected && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="font-mono">{selected.target}</span>
                {selected.domain && <span>{selected.domain}</span>}
              </div>
            )}
          </section>

          {/* Step 2 — candidate details */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.releaseGates.candidateDetails}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.releaseGates.fieldReleaseName} value={form.label ?? ''} onChange={(v) => set('label', v)} placeholder="v1.9.0-rc.1" />
              <Field label={t.releaseGates.fieldTargetVersion} value={form.target_version ?? ''} onChange={(v) => set('target_version', v)} placeholder="v1.9.0" />
              <Field label={t.releaseGates.fieldEnvironment} value={form.environment ?? ''} onChange={(v) => set('environment', v)} placeholder="staging" />
              <Field label={t.releaseGates.fieldBranch} value={form.git_ref ?? ''} onChange={(v) => set('git_ref', v)} placeholder="feature/…" />
              <Field label={t.releaseGates.fieldCommit} value={form.git_commit ?? ''} onChange={(v) => set('git_commit', v)} placeholder="abc123" />
              <Field label={t.releaseGates.fieldPR} value={form.pr_ref ?? ''} onChange={(v) => set('pr_ref', v)} placeholder="PR-582" />
              <Field label={t.releaseGates.fieldIssue} value={form.issue_ref ?? ''} onChange={(v) => set('issue_ref', v)} placeholder="JIRA-123" />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.releaseGates.fieldChangeSummary}</label>
              <textarea
                value={form.change_summary ?? ''}
                onChange={(e) => set('change_summary', e.target.value)}
                rows={2}
                placeholder={t.releaseGates.changeSummaryHint}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] placeholder:text-slate-300"
              />
            </div>
          </section>

          {/* Step 3 — gate test scope */}
          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.releaseGates.gateTestScope}</div>
            <div className="text-[13px] font-semibold text-slate-800">
              {serviceId
                ? (scopeCount > 0 ? tkey(t, 'releaseGates.testsIncluded', { count: scopeCount }) : t.releaseGates.noGateTests)
                : '—'}
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-slate-500">
              <li>• {t.releaseGates.scopeHint1}</li>
              <li>• {t.releaseGates.scopeHint2}</li>
              <li>• {t.releaseGates.scopeHint3}</li>
            </ul>
          </section>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4">
          <label className="mb-3 flex items-center gap-2 text-[12px] text-slate-600">
            <input type="checkbox" checked={runAfter} onChange={(e) => setRunAfter(e.target.checked)} className="rounded border-slate-300" />
            {t.releaseGates.runAfterCreate}
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={busy || !serviceId}
              className={cn('inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-white', busy || !serviceId ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-500')}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              {runAfter ? t.releaseGates.createAndRun : t.releaseGates.createCandidateOnly}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none"
      />
    </div>
  );
}
