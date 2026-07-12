'use client';

import { useState, useEffect } from 'react';
import {
  fetchAIStatus, fetchEnvironments,
  type AIStatusResponse, type EnvironmentItem,
} from '@/lib/api';
import {
  Sparkles, Globe, User, Info, Languages,
  CheckCircle2, XCircle, Server, Shield,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type TabId = 'general' | 'ai' | 'environments';

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const [tab, setTab] = useState<TabId>('general');
  const [aiStatus, setAiStatus] = useState<AIStatusResponse | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [envLoading, setEnvLoading] = useState(true);

  useEffect(() => {
    fetchAIStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
      .finally(() => setAiLoading(false));
    fetchEnvironments()
      .then((e) => setEnvironments(e ?? []))
      .catch(() => setEnvironments([]))
      .finally(() => setEnvLoading(false));
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: t.settings.tabGeneral },
    { id: 'ai', label: t.settings.tabAI },
    { id: 'environments', label: t.settings.tabEnvironments },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.settings.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.settings.subtitle}</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              tab === tb.id
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {tb.label}
            {tab === tb.id && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600" />
            )}
          </button>
        ))}
      </div>

      {/* ── General ── */}
      {tab === 'general' && (
        <>
          <Section icon={User} iconColor="text-violet-600" title={t.settings.currentUser}>
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">admin</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <Shield className="h-3 w-3" />
                  {t.settings.administrator}
                </div>
              </div>
            </div>
          </Section>

          <Section icon={Languages} iconColor="text-blue-600" title={t.settings.language}>
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['en', 'tr'] as const).map((lng) => (
                <button
                  key={lng}
                  onClick={() => setLocale(lng)}
                  className={cn(
                    'rounded-md px-4 py-1.5 text-sm font-semibold transition-colors',
                    locale === lng ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                  )}
                >
                  {lng === 'en' ? 'English' : 'Türkçe'}
                </button>
              ))}
            </div>
          </Section>

          <Section icon={Info} iconColor="text-slate-500" title={t.settings.about}>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label={t.settings.platform} value="Inkling Test Automation" />
              <InfoRow label={t.settings.backend} value="Go + PostgreSQL" />
              <InfoRow label={t.settings.frontend} value="Next.js 15 + React 19" />
              <InfoRow label={t.settings.version} value="1.0.0" />
            </div>
          </Section>
        </>
      )}

      {/* ── AI ── */}
      {tab === 'ai' && (
        <Section icon={Sparkles} iconColor="text-blue-600" title={t.settings.aiConfig}>
          {aiLoading ? (
            <Skeleton />
          ) : aiStatus?.configured ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700">{t.settings.aiReady}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label={t.settings.provider} value={aiStatus.provider ?? t.settings.unknown} />
                <InfoRow label={t.settings.model} value={aiStatus.model || t.settings.default} />
                <InfoRow label={t.settings.apiUrl} value={aiStatus.apiUrl || t.settings.defaultEndpoint} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="text-sm font-medium text-red-700">{t.settings.aiNotConfigured}</span>
              </div>
              <p className="text-xs text-slate-500">
                Set <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono">AI_API_KEY</code> {t.settings.aiSetKey}
              </p>
            </div>
          )}
        </Section>
      )}

      {/* ── Environments ── */}
      {tab === 'environments' && (
        <Section icon={Globe} iconColor="text-blue-600" title={t.settings.environments}>
          {envLoading ? (
            <Skeleton />
          ) : environments.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">{t.settings.noEnvironments}</p>
              <p className="text-xs text-slate-400">
                Add configuration files to the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono">environments/</code> directory.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {environments.map((env) => (
                <div key={env.name} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Server className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-800">{env.name}</span>
                    {env.description && <span className="text-xs text-slate-400">{env.description}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label={t.settings.baseUrl} value={env.baseUrl} />
                    {env.wsUrl && <InfoRow label={t.settings.wsUrl} value={env.wsUrl} />}
                    {env.grpcTarget && <InfoRow label={t.settings.grpcTarget} value={env.grpcTarget} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ icon: Icon, iconColor, title, children }: {
  icon: typeof Info; iconColor: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-700 truncate" title={value}>{value}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-4 w-48" />
      <div className="skeleton h-4 w-32" />
    </div>
  );
}
