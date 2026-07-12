'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Send, Loader2, CheckCircle2, XCircle, Zap, ChevronRight, ChevronLeft, Sparkles, Wand2, FlaskConical, ShieldCheck,
} from 'lucide-react';
import { grpcMethodToStepConfig } from '@/lib/catalog-to-step';
import {
  invokeCatalogTarget,
  fetchHealthHistory,
  type CatalogEntry,
  type InvokeResult,
  type ServiceCoverage,
  type HealthReport,
} from '@/lib/api';
import type { ProtoMethodInfo } from '@/components/builder/grpc-service-picker';
import type { RestEndpointInfo } from '@/components/builder/rest-endpoint-picker';
import { ProtoFieldForm } from '@/components/builder/proto-field-form';
import { ResponseTree } from '@/components/builder/response-tree';
import { HealthDot } from '@/components/catalog-chips';
import { useI18n } from '@/lib/i18n';

interface RestSchemaNode {
  type?: string;
  properties?: Record<string, string>;
  items?: RestSchemaNode;
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

interface CatalogDetailDrawerProps {
  entry: CatalogEntry;
  coverage?: ServiceCoverage;
  onClose: () => void;
}

export function CatalogDetailDrawer({ entry, coverage, onClose }: CatalogDetailDrawerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const catalog = entry.catalog as Record<string, unknown> | null;
  const methods = (entry.protocol === 'grpc' ? (catalog?.methods ?? []) : []) as ProtoMethodInfo[];
  const endpoints = (entry.protocol === 'rest' ? (catalog?.endpoints ?? []) : []) as RestEndpointInfo[];
  const coveredSet = new Set((coverage?.operations ?? []).filter((o) => o.covered).map((o) => o.name));
  const isCovered = (name: string) => coveredSet.has(name);

  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMethod(null);
    setSelectedEndpoint(null);
  }, [entry.id]);

  const currentMethod = methods.find((m) => m.name === selectedMethod) ?? null;
  const currentEndpoint = endpoints.find((e) => `${e.method} ${e.path}` === selectedEndpoint) ?? null;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${entry.protocol === 'grpc' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                {entry.protocol}
              </span>
              <HealthDot status={entry.health_status} />
              <h2 className="truncate text-sm font-semibold text-slate-800" title={entry.name}>{entry.name}</h2>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400" title={entry.target}>{entry.target}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={() => router.push(`/release-gates/${encodeURIComponent(entry.id)}`)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              title={t.releaseGates.openGate}
            >
              <ShieldCheck className="h-3 w-3" /> {t.releaseGates.openGate}
            </button>
            <button
              onClick={() => router.push(`/builder?prompt=${encodeURIComponent(`Generate a comprehensive test suite for the ${entry.protocol} service "${entry.id}": one test per operation covering the happy path and a key error/edge case, using its discovered methods and fields.`)}`)}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-500 transition-colors"
              title={t.catalog.generateMissingCoverage}
            >
              <Wand2 className="h-3 w-3" /> {t.catalog.generateMissingCoverage}
            </button>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t.catalog.close}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — master (list) → detail (focused method/endpoint) */}
        <div className="flex-1 overflow-y-auto p-4">
          {!currentMethod && !currentEndpoint ? (
            <>
              <HealthTrend serviceId={entry.id} t={t} />
              {entry.protocol === 'grpc' ? (
                <MethodList methods={methods} selected={selectedMethod} onSelect={setSelectedMethod} catalogId={entry.id} isCovered={isCovered} t={t} />
              ) : (
                <EndpointList endpoints={endpoints} selected={selectedEndpoint} onSelect={setSelectedEndpoint} catalogId={entry.id} isCovered={isCovered} t={t} />
              )}
            </>
          ) : (
            <div className="space-y-3">
              {/* Detail header: back + name + create test */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => { setSelectedMethod(null); setSelectedEndpoint(null); }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> {t.catalog.backToMethods}
                </button>
                <button
                  onClick={() => router.push(
                    currentMethod
                      ? `/builder?catalog=${encodeURIComponent(entry.id)}&method=${encodeURIComponent(currentMethod.name)}`
                      : `/builder?catalog=${encodeURIComponent(entry.id)}&endpoint=${encodeURIComponent(`${currentEndpoint!.method} ${currentEndpoint!.path}`)}`,
                  )}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-500 transition-colors"
                >
                  <Sparkles className="h-3 w-3" /> {t.catalog.createTest}
                </button>
              </div>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                {currentEndpoint && (
                  <span className={`inline-block w-12 flex-shrink-0 text-center rounded px-1 py-0.5 text-[9px] font-bold uppercase ${METHOD_COLOR[currentEndpoint.method.toUpperCase()] ?? 'bg-slate-100 text-slate-700'}`}>
                    {currentEndpoint.method}
                  </span>
                )}
                <code className="truncate text-xs font-semibold text-slate-800" title={currentMethod?.name ?? currentEndpoint?.path}>
                  {currentMethod?.name ?? currentEndpoint?.path}
                </code>
              </div>

              {currentMethod && <GrpcTryIt entry={entry} method={currentMethod} />}
              {currentEndpoint && <RestTryIt entry={entry} endpoint={currentEndpoint} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Method / Endpoint lists                                            */
/* ------------------------------------------------------------------ */

function MethodList({ methods, selected, onSelect, catalogId, isCovered, t }: {
  methods: ProtoMethodInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
  catalogId: string;
  isCovered: (name: string) => boolean;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const router = useRouter();
  if (methods.length === 0) return <p className="text-xs text-slate-400">{t.catalog.noMethodsDiscovered}</p>;

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase text-slate-400">
        {methods.length} {t.catalog.methodsDiscovered}
      </div>
      <div className="space-y-1">
        {methods.map((m) => (
          <div
            key={m.name}
            onClick={() => onSelect(m.name)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
              selected === m.name ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ChevronRight className={`h-3 w-3 flex-shrink-0 text-slate-400 transition-transform ${selected === m.name ? 'rotate-90' : ''}`} />
            <code className="flex-1 truncate font-semibold text-slate-700">{m.name}</code>
            <CoveredBadge covered={isCovered(m.name)} t={t} />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); router.push(`/builder?catalog=${encodeURIComponent(catalogId)}&method=${encodeURIComponent(m.name)}`); }}
              className="ml-auto inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-500 transition-colors"
              title={t.catalog.createTest}
            >
              <Sparkles className="h-3 w-3" /> {t.catalog.createTest}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointList({ endpoints, selected, onSelect, catalogId, isCovered, t }: {
  endpoints: RestEndpointInfo[];
  selected: string | null;
  onSelect: (key: string) => void;
  catalogId: string;
  isCovered: (name: string) => boolean;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const router = useRouter();
  if (endpoints.length === 0) return <p className="text-xs text-slate-400">{t.catalog.noEndpointsDiscovered}</p>;

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase text-slate-400">
        {endpoints.length} {t.catalog.endpointsDiscovered}
      </div>
      <div className="space-y-1">
        {endpoints.map((ep, i) => {
          const key = `${ep.method} ${ep.path}`;
          return (
            <div
              key={i}
              onClick={() => onSelect(key)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                selected === key ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className={`inline-block w-12 flex-shrink-0 text-center rounded px-1 py-0.5 text-[9px] font-bold uppercase ${METHOD_COLOR[ep.method.toUpperCase()] ?? 'bg-slate-100 text-slate-700'}`}>
                {ep.method}
              </span>
              <code className="flex-1 truncate text-slate-700">{ep.path}</code>
              <CoveredBadge covered={isCovered(`${ep.method.toUpperCase()} ${ep.path}`)} t={t} />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); router.push(`/builder?catalog=${encodeURIComponent(catalogId)}&endpoint=${encodeURIComponent(key)}`); }}
                className="ml-auto inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-500 transition-colors"
                title={t.catalog.createTest}
              >
                <Sparkles className="h-3 w-3" /> {t.catalog.createTest}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Try it — gRPC                                                      */
/* ------------------------------------------------------------------ */

function GrpcTryIt({ entry, method }: { entry: CatalogEntry; method: ProtoMethodInfo }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<InvokeResult | null>(null);

  useEffect(() => {
    setValues({});
    setResult(null);
  }, [method.name]);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await invokeCatalogTarget(entry.id, { method: method.name, message: values });
      setResult(res);
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.catalog.tryOperation}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setValues((grpcMethodToStepConfig(method).message as Record<string, unknown>) ?? {})}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            title={t.catalog.fillSample}
          >
            <FlaskConical className="h-3 w-3" /> {t.catalog.fillSample}
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {sending ? t.catalog.sending : t.catalog.send}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {method.requestType ?? 'Request'}
        </label>
        <ProtoFieldForm fields={method.requestFields ?? []} values={values} onChange={setValues} />
      </div>

      {method.responseFields && method.responseFields.length > 0 && (
        <ResponseTree fields={method.responseFields} onAddExtract={() => {}} />
      )}

      {result && <InvokeResultView result={result} protocol="grpc" t={t} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Try it — REST                                                      */
/* ------------------------------------------------------------------ */

function RestTryIt({ entry, endpoint }: { entry: CatalogEntry; endpoint: RestEndpointInfo }) {
  const { t } = useI18n();
  const [path, setPath] = useState(endpoint.path);
  const [bodyText, setBodyText] = useState('{}');
  const [bodyError, setBodyError] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<InvokeResult | null>(null);

  const hasBody = endpoint.method.toUpperCase() !== 'GET' && endpoint.method.toUpperCase() !== 'DELETE';

  useEffect(() => {
    setPath(endpoint.path);
    setBodyError('');
    setResult(null);
    const schema = endpoint.requestBody as RestSchemaNode | undefined;
    if (schema?.properties) {
      const draft: Record<string, string> = {};
      for (const k of Object.keys(schema.properties)) draft[k] = '';
      setBodyText(JSON.stringify(draft, null, 2));
    } else {
      setBodyText('{}');
    }
  }, [endpoint.method, endpoint.path, endpoint.requestBody]);

  const handleSend = async () => {
    setBodyError('');
    let message: Record<string, unknown> | undefined;
    if (hasBody) {
      try {
        message = bodyText.trim() ? JSON.parse(bodyText) : undefined;
      } catch {
        setBodyError(t.catalog.invalidJson);
        return;
      }
    }
    setSending(true);
    setResult(null);
    try {
      const res = await invokeCatalogTarget(entry.id, { method: endpoint.method, path, message });
      setResult(res);
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setSending(false);
    }
  };

  const parameters = (endpoint.parameters ?? []) as Array<{ name: string; in: string; required: boolean; type: string }>;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.catalog.tryOperation}</span>
        <button
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          {sending ? t.catalog.sending : t.catalog.send}
        </button>
      </div>

      {parameters.length > 0 && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.catalog.parameters}</label>
          <div className="space-y-1">
            {parameters.map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-[11px]">
                <code className="font-medium text-slate-700">{p.name}</code>
                <span className="text-slate-400">{p.in}</span>
                <span className="text-slate-400">{p.type}</span>
                {p.required && <span className="rounded bg-amber-50 px-1 text-[9px] font-semibold text-amber-600">{t.catalog.required}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <RestSchemaView label={t.catalog.requestBody} schema={endpoint.requestBody as Record<string, unknown> | undefined} />
      <RestSchemaView label={t.catalog.responseSchema} schema={endpoint.responseSchema as Record<string, unknown> | undefined} />

      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.catalog.path}</label>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {hasBody && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.catalog.body}</label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {bodyError && <p className="mt-1 text-[11px] text-red-500">{bodyError}</p>}
        </div>
      )}

      {result && <InvokeResultView result={result} protocol="rest" t={t} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared bits                                                        */
/* ------------------------------------------------------------------ */

const fmtMs = (v: number | null) => (v != null ? `${Math.round(v)}ms` : '—');

function HealthTrend({ serviceId, t }: { serviceId: string; t: ReturnType<typeof useI18n>['t'] }) {
  const [rep, setRep] = useState<HealthReport | null>(null);
  useEffect(() => { fetchHealthHistory(serviceId).then(setRep).catch(() => setRep(null)); }, [serviceId]);
  if (!rep || !rep.stats || rep.stats.total === 0) return null;
  const s = rep.stats;
  const checks = rep.checks.slice(-40);
  const max = Math.max(1, ...checks.map((c) => c.latency_ms ?? 0));
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-500">{t.catalog.latencyTrend}</span>
        <span className="text-slate-400">{t.catalog.uptime}: {s.uptime != null ? Math.round(s.uptime * 100) : '—'}%</span>
      </div>
      <div className="mt-2 flex h-8 items-end gap-0.5">
        {checks.map((c, i) => (
          <div
            key={i}
            title={`${c.latency_ms ?? 0}ms`}
            style={{ height: `${Math.max(6, ((c.latency_ms ?? 0) / max) * 100)}%` }}
            className={`flex-1 rounded-sm ${c.status === 'healthy' ? 'bg-indigo-400' : 'bg-red-300'}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-3 text-[10px] text-slate-400">
        <span>p50 {fmtMs(s.p50)}</span><span>p95 {fmtMs(s.p95)}</span><span>p99 {fmtMs(s.p99)}</span><span>n={s.total}</span>
      </div>
    </div>
  );
}

function CoveredBadge({ covered, t }: { covered: boolean; t: ReturnType<typeof useI18n>['t'] }) {
  return covered ? (
    <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700" title={t.catalog.tested}>
      <CheckCircle2 className="h-2.5 w-2.5" /> {t.catalog.tested}
    </span>
  ) : (
    <span className="inline-block flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-400" title={t.catalog.untested}>
      {t.catalog.untested}
    </span>
  );
}

function RestSchemaView({ label, schema }: { label: string; schema?: Record<string, unknown> }) {
  if (!schema) return null;
  const node = schema as RestSchemaNode;
  const props = node.properties ?? node.items?.properties;
  if (!node.type && !props) return null;

  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-[11px] font-mono space-y-0.5">
        {node.type && <div className="text-slate-400">type: {node.type}{node.items ? '[]' : ''}</div>}
        {props && Object.entries(props).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-slate-700">{k}</span>
            <span className="text-slate-400">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvokeResultView({ result, protocol, t }: { result: InvokeResult; protocol: 'grpc' | 'rest'; t: ReturnType<typeof useI18n>['t'] }) {
  const ok = result.ok && !result.error;
  return (
    <div className={`rounded-lg border p-2.5 text-[11px] ${ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
          <span className="font-medium text-slate-700">
            {protocol === 'grpc'
              ? (result.status ? `Code ${result.status.Code}` : t.catalog.response)
              : (result.status_code !== undefined ? `HTTP ${result.status_code}` : t.catalog.response)}
          </span>
        </div>
        {result.latency_ms !== undefined && (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Zap className="h-3 w-3" /> {result.latency_ms}ms
          </span>
        )}
      </div>
      {result.error && <p className="text-red-600 mb-1.5">{result.error}</p>}
      {result.status?.Details && <p className="text-slate-500 mb-1.5">{result.status.Details}</p>}
      <pre className="max-h-48 overflow-auto rounded bg-white/70 p-2 text-[10px] text-slate-600">
        {JSON.stringify(result.message ?? result.body ?? {}, null, 2)}
      </pre>
    </div>
  );
}
