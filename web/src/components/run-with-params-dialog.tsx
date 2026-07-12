'use client';

import { useState, useEffect } from 'react';
import { X, Play, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { RunContext, SessionItem } from '@/lib/api';
import { fetchSessions, fetchEnvironments } from '@/lib/api';

interface RunWithParamsDialogProps {
  testId: string;
  testName: string;
  defaultParams: Record<string, string>;
  onRun: (mode: string, overrides: Record<string, string>, context?: RunContext, sessionId?: string) => Promise<void>;
  onClose: () => void;
}

export function RunWithParamsDialog({
  testId,
  testName,
  defaultParams,
  onRun,
  onClose,
}: RunWithParamsDialogProps) {
  const mode = 'real';
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...defaultParams }));
  const [running, setRunning] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [gitCommit, setGitCommit] = useState('');
  const [jiraRef, setJiraRef] = useState('');
  const [triggeredBy, setTriggeredBy] = useState('');
  const [runTags, setRunTags] = useState('');

  const [environments, setEnvironments] = useState<Array<{ name: string; description?: string }>>([]);

  useEffect(() => {
    fetchSessions({ limit: 50 })
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));

    fetchEnvironments()
      .then(setEnvironments)
      .catch(() => setEnvironments([]));
  }, []);

  const paramKeys = Object.keys(defaultParams);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const overrides: Record<string, string> = {};
      for (const key of paramKeys) {
        if (values[key] !== undefined && values[key] !== defaultParams[key]) {
          overrides[key] = values[key];
        }
      }

      const context: RunContext = {};
      if (label.trim()) context.label = label.trim();
      if (environment.trim()) context.environment = environment.trim();
      if (gitRef.trim()) context.git_ref = gitRef.trim();
      if (gitCommit.trim()) context.git_commit = gitCommit.trim();
      if (jiraRef.trim()) context.jira_ref = jiraRef.trim();
      if (triggeredBy.trim()) context.triggered_by = triggeredBy.trim();
      if (runTags.trim()) context.run_tags = runTags.split(',').map((t) => t.trim()).filter(Boolean);

      const hasContext = Object.keys(context).length > 0;
      await onRun(mode, overrides, hasContext ? context : undefined, selectedSessionId || undefined);
      onClose();
    } finally {
      setRunning(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200/80 bg-white shadow-2xl animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">{testName}</h2>
            <p className="mt-0.5 text-[11px] font-mono text-slate-400">{testId}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Session */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Session (optional)</label>
            {sessionsLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading sessions...
              </div>
            ) : (
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className={inputCls}
              >
                <option value="">No session</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}{s.environment ? ` (${s.environment})` : ''}{s.git_ref ? ` — ${s.git_ref}` : ''}
                  </option>
                ))}
              </select>
            )}
            {sessions.length === 0 && !sessionsLoading && (
              <p className="mt-1 text-[11px] text-slate-400">No sessions found. Create one from the Sessions page.</p>
            )}
          </div>

          {/* Parameters */}
          {paramKeys.length > 0 ? (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Parameters</label>
              <div className="space-y-3">
                {paramKeys.map((key) => (
                  <div key={key}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label className="text-sm font-medium text-slate-700">{key}</label>
                      <span className="text-[10px] text-slate-400 font-mono">default: {defaultParams[key]}</span>
                    </div>
                    <input
                      type="text"
                      value={values[key] ?? ''}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={defaultParams[key]}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">This test has no configurable parameters.</p>
          )}

          {/* Context Section (collapsible) */}
          <div className="border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowContext(!showContext)}
              className="flex w-full items-center justify-between text-[13px] font-semibold text-slate-700 hover:text-slate-900 transition-colors"
            >
              <span>Run Context (optional)</span>
              {showContext ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>
            <p className="mt-1 text-[11px] text-slate-400">
              Track why this run was triggered and which version it validates.
            </p>

            {showContext && (
              <div className="mt-4 space-y-3">
                <ContextField label="Label" placeholder="e.g. v2.4.1 pre-deploy smoke" value={label} onChange={setLabel} />
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Environment</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select environment...</option>
                    {environments.map((env) => (
                      <option key={env.name} value={env.name}>
                        {env.name}{env.description ? ` — ${env.description}` : ''}
                      </option>
                    ))}
                    <option value="custom">Custom...</option>
                  </select>
                  {environment === 'custom' && (
                    <input
                      type="text"
                      placeholder="Enter custom environment name"
                      onChange={(e) => setEnvironment(e.target.value)}
                      className={`mt-2 ${inputCls}`}
                    />
                  )}
                </div>
                <ContextField label="Git Branch / Ref" placeholder="e.g. fix/ORDER-1234, main" value={gitRef} onChange={setGitRef} />
                <ContextField label="Git Commit" placeholder="e.g. a1b2c3d" value={gitCommit} onChange={setGitCommit} />
                <ContextField label="Jira / Issue Ref" placeholder="e.g. ORDER-1234" value={jiraRef} onChange={setJiraRef} />
                <ContextField label="Triggered By" placeholder="e.g. hasim, github-actions" value={triggeredBy} onChange={setTriggeredBy} />
                <ContextField label="Tags" placeholder="comma separated: hotfix, pre-deploy" value={runTags} onChange={setRunTags} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 ring-inset hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running...' : 'Run Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContextField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
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
