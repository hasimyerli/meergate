'use client';

import { useState } from 'react';
import type { StepData } from '@/app/builder/page';
import { Trash2, Plus, X } from 'lucide-react';
import { GrpcServicePicker, type ProtoServiceInfo, type ProtoMethodInfo } from './grpc-service-picker';
import { RestEndpointPicker, type RestServiceInfo, type RestEndpointInfo } from './rest-endpoint-picker';
import { ProtoFieldForm } from './proto-field-form';
import { ResponseTree } from './response-tree';
import { restEndpointToStepConfig, grpcMethodToStepConfig } from '@/lib/catalog-to-step';

export interface ConnectedExtract {
  stepName: string;
  key: string;
  path: string;
}

interface StepConfigPanelProps {
  node: { id: string; data: StepData };
  onUpdate: (data: Partial<StepData>) => void;
  onDelete: () => void;
  protoServices?: ProtoServiceInfo[];
  restServices?: RestServiceInfo[];
  connectedExtracts?: ConnectedExtract[];
}

export function StepConfigPanel({ node, onUpdate, onDelete, protoServices = [], restServices = [], connectedExtracts = [] }: StepConfigPanelProps) {
  const data = node.data;
  const [newExtractKey, setNewExtractKey] = useState('');
  const [newExtractPath, setNewExtractPath] = useState('');

  const updateConfig = (key: string, value: unknown) => {
    onUpdate({ config: { ...data.config, [key]: value } });
  };

  const updateMultipleConfig = (updates: Record<string, unknown>) => {
    onUpdate({ config: { ...data.config, ...updates } });
  };

  const addAssertion = () => {
    onUpdate({
      assertions: [...data.assertions, { type: 'statusCode', expected: 200 }],
    });
  };

  const removeAssertion = (index: number) => {
    onUpdate({
      assertions: data.assertions.filter((_, i) => i !== index),
    });
  };

  const updateAssertion = (index: number, field: string, value: unknown) => {
    const updated = data.assertions.map((a, i) =>
      i === index ? { ...a, [field]: value } : a,
    );
    onUpdate({ assertions: updated });
  };

  const addExtract = () => {
    if (!newExtractKey) return;
    onUpdate({ extract: { ...data.extract, [newExtractKey]: newExtractPath } });
    setNewExtractKey('');
    setNewExtractPath('');
  };

  const addExtractFromResponse = (key: string, path: string) => {
    onUpdate({ extract: { ...data.extract, [key]: path } });
  };

  const removeExtract = (key: string) => {
    const next = { ...data.extract };
    delete next[key];
    onUpdate({ extract: next });
  };

  const currentService = protoServices.find((s) => s.fqn === data.config.service);
  const rpcMethod = String(data.config.rpcMethod ?? '');
  const currentMethod = currentService?.methods?.find(
    (m) => m.name === rpcMethod || m.name.toLowerCase() === rpcMethod.toLowerCase(),
  );

  const handleSelectService = (fqn: string, protoFile: string) => {
    updateMultipleConfig({ service: fqn, protoFile, rpcMethod: '', message: {} });
  };

  const handleSelectRestEndpoint = (service: RestServiceInfo, endpoint: RestEndpointInfo) => {
    updateMultipleConfig(restEndpointToStepConfig(service, endpoint));
  };

  const handleSelectMethod = (method: ProtoMethodInfo) => {
    updateMultipleConfig(grpcMethodToStepConfig(method));
  };

  return (
    <div className="w-96 flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step Config</span>
          <button onClick={onDelete} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Step Name">
            <input
              type="text"
              value={data.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </Field>

          <Field label="Type">
            <select
              value={data.type}
              onChange={(e) => onUpdate({ type: e.target.value, config: {} })}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="apiCall">API Call</option>
              <option value="grpcCall">gRPC Call</option>
              <option value="wsSubscribe">WebSocket</option>
              <option value="browserAction">Browser Action</option>
              <option value="waitUntil">Wait</option>
              <option value="assert">Assert</option>
            </select>
          </Field>
        </div>
      </div>

      {/* Type-specific config */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        {data.type === 'apiCall' && (
          <>
            {restServices.length > 0 && (
              <RestEndpointPicker
                services={restServices}
                selectedService={String(data.config._catalogService ?? '')}
                selectedEndpoint={
                  data.config.path
                    ? { method: String(data.config.method ?? 'GET'), path: String(data.config.path) }
                    : null
                }
                onSelectEndpoint={handleSelectRestEndpoint}
              />
            )}
            <Field label="Method">
              <select value={String(data.config.method ?? 'GET')} onChange={(e) => updateConfig('method', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </Field>
            <Field label="Base URL">
              <input type="text" value={String(data.config.baseUrl ?? '')} onChange={(e) => updateConfig('baseUrl', e.target.value)}
                placeholder="https://api.example.com" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </Field>
            <Field label="Path">
              <input type="text" value={String(data.config.path ?? '')} onChange={(e) => updateConfig('path', e.target.value)}
                placeholder="/v1/ticker" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </Field>
            <Field label="Request Body (JSON)">
              <textarea value={typeof data.config.body === 'object' ? JSON.stringify(data.config.body, null, 2) : String(data.config.body ?? '')}
                onChange={(e) => { try { updateConfig('body', JSON.parse(e.target.value)); } catch { /* ignore parse errors while typing */ } }}
                placeholder='{"currency": "btc"}' rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </Field>
          </>
        )}

        {data.type === 'grpcCall' && (
          <>
            {protoServices.length > 0 ? (
              <>
                <GrpcServicePicker
                  services={protoServices}
                  selectedService={String(data.config.service ?? '')}
                  selectedMethod={String(data.config.rpcMethod ?? '')}
                  onSelectService={handleSelectService}
                  onSelectMethod={handleSelectMethod}
                />

                {currentMethod && (
                  <>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                        Request: {currentMethod.requestType}
                      </label>
                      <ProtoFieldForm
                        fields={currentMethod.requestFields ?? []}
                        values={(data.config.message as Record<string, unknown>) ?? {}}
                        onChange={(vals) => updateConfig('message', vals)}
                      />
                    </div>

                    <ResponseTree
                      fields={currentMethod.responseFields ?? []}
                      onAddExtract={addExtractFromResponse}
                    />
                  </>
                )}

                {data.config.service && !currentMethod && data.config.rpcMethod && (
                  <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    Method &quot;{String(data.config.rpcMethod)}&quot; not found in service definition
                  </div>
                )}
              </>
            ) : (
              <>
                <Field label="Service FQN">
                  <input type="text" value={String(data.config.service ?? '')} onChange={(e) => updateConfig('service', e.target.value)}
                    placeholder="proto.balance.v1.BalanceService" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                </Field>
                <Field label="RPC Method">
                  <input type="text" value={String(data.config.rpcMethod ?? '')} onChange={(e) => updateConfig('rpcMethod', e.target.value)}
                    placeholder="GetAssets" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                </Field>
                <Field label="Proto File">
                  <input type="text" value={String(data.config.protoFile ?? '')} onChange={(e) => updateConfig('protoFile', e.target.value)}
                    placeholder="proto/balance/v1/balance.proto" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                </Field>
                <Field label="Message (JSON)">
                  <textarea value={typeof data.config.message === 'object' ? JSON.stringify(data.config.message, null, 2) : String(data.config.message ?? '')}
                    onChange={(e) => { try { updateConfig('message', JSON.parse(e.target.value)); } catch { /* ignore */ } }}
                    placeholder='{"user_id": "{{params.user_id}}"}' rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                </Field>
              </>
            )}
          </>
        )}

        {data.type === 'wsSubscribe' && (
          <>
            <Field label="WebSocket URL">
              <input type="text" value={String(data.config.url ?? '')} onChange={(e) => updateConfig('url', e.target.value)}
                placeholder="wss://echo.websocket.events" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </Field>
            <Field label="Channel">
              <input type="text" value={String(data.config.channel ?? '')} onChange={(e) => updateConfig('channel', e.target.value)}
                placeholder="e.g. updates" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </Field>
            <Field label="Wait (ms)">
              <input type="number" value={Number(data.config.waitMs ?? 5000)} onChange={(e) => updateConfig('waitMs', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </Field>
          </>
        )}

        {data.type === 'browserAction' && (
          <>
            <Field label="Action">
              <select value={String(data.config.action ?? 'navigate')} onChange={(e) => updateConfig('action', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                <option value="navigate">Navigate</option>
                <option value="click">Click</option>
                <option value="fill">Fill</option>
                <option value="select">Select</option>
                <option value="hover">Hover</option>
                <option value="press">Press Key</option>
                <option value="screenshot">Screenshot</option>
                <option value="assertText">Assert Text</option>
                <option value="assertVisible">Assert Visible</option>
                <option value="waitForSelector">Wait for Selector</option>
                <option value="extractText">Extract Text</option>
              </select>
            </Field>
            {(data.config.action === 'navigate' || !data.config.action || data.config.action === 'screenshot') && (
              <Field label={data.config.action === 'screenshot' ? 'URL (optional — navigates before capturing)' : 'URL'}>
                <input type="text" value={String(data.config.url ?? '')} onChange={(e) => updateConfig('url', e.target.value)}
                  placeholder="https://app.example.com" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </Field>
            )}
            {data.config.action && data.config.action !== 'navigate' && data.config.action !== 'screenshot' && (
              <Field label="Selector">
                <input type="text" value={String(data.config.selector ?? '')} onChange={(e) => updateConfig('selector', e.target.value)}
                  placeholder="[data-testid='login-btn']" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </Field>
            )}
            {(data.config.action === 'fill' || data.config.action === 'select' || data.config.action === 'assertText' || data.config.action === 'press') && (
              <Field label="Value">
                <input type="text" value={String(data.config.value ?? '')} onChange={(e) => updateConfig('value', e.target.value)}
                  placeholder="Enter value..." className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </Field>
            )}
            {data.config.action === 'screenshot' && (
              <Field label="Screenshot Name">
                <input type="text" value={String(data.config.screenshotName ?? '')} onChange={(e) => updateConfig('screenshotName', e.target.value)}
                  placeholder="login-page" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </Field>
            )}
          </>
        )}

        {data.type === 'waitUntil' && (
          <Field label="Wait (ms)">
            <input type="number" value={Number(data.config.waitMs ?? 1000)} onChange={(e) => updateConfig('waitMs', Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          </Field>
        )}
      </div>

      {/* Extract */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Extract</span>
        </div>
        {Object.entries(data.extract).map(([key, path]) => (
          <div key={key} className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-indigo-600 min-w-[60px]">{key}</span>
            <span className="text-[10px] text-slate-400 truncate flex-1">{path}</span>
            <button onClick={() => removeExtract(key)} className="text-slate-300 hover:text-red-500"><X className="h-3 w-3" /></button>
          </div>
        ))}
        <div className="flex items-center gap-1.5 mt-2">
          <input type="text" value={newExtractKey} onChange={(e) => setNewExtractKey(e.target.value)} placeholder="key"
            className="w-20 rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          <input type="text" value={newExtractPath} onChange={(e) => setNewExtractPath(e.target.value)} placeholder="$.path.to.value"
            className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          <button onClick={addExtract} disabled={!newExtractKey}
            className="rounded bg-indigo-50 p-1 text-indigo-600 hover:bg-indigo-100 disabled:opacity-30 transition-colors">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Connected Extracts */}
      {connectedExtracts.length > 0 && (
        <div className="p-4 border-b border-slate-100">
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Available from connected steps
          </label>
          <div className="space-y-1">
            {connectedExtracts.map((ext) => (
              <div key={`${ext.stepName}-${ext.key}`} className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 truncate max-w-[70px]">{ext.stepName}</span>
                <span className="text-xs font-mono font-medium text-indigo-600">{ext.key}</span>
                <span className="text-[10px] text-slate-300 truncate flex-1">{ext.path}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assertions */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assertions</span>
          <button onClick={addAssertion} className="rounded bg-indigo-50 p-1 text-indigo-600 hover:bg-indigo-100 transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick-add assertion from connected extracts */}
        {connectedExtracts.length > 0 && data.assertions.length === 0 && (
          <div className="mb-3 rounded-lg bg-indigo-50 border border-indigo-100 p-2.5">
            <p className="text-[10px] text-indigo-600 font-medium mb-1.5">Quick add from connected steps:</p>
            <div className="flex flex-wrap gap-1">
              {connectedExtracts.map((ext) => (
                <button
                  key={`qa-${ext.key}`}
                  onClick={() => {
                    onUpdate({
                      assertions: [
                        ...data.assertions,
                        { type: 'nonEmpty', path: ext.path },
                      ],
                    });
                  }}
                  className="rounded-md bg-white border border-indigo-200 px-2 py-1 text-[10px] font-mono text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  {ext.key}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {data.assertions.map((assertion, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-2.5 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <select value={assertion.type} onChange={(e) => updateAssertion(i, 'type', e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                  <option value="statusCode">Status Code</option>
                  <option value="jsonPath">JSON Path</option>
                  <option value="jsonPathIncludes">JSON Path Includes</option>
                  <option value="jsonPathNotIncludes">JSON Path Not Includes</option>
                  <option value="greaterThan">Greater Than</option>
                  <option value="lessThan">Less Than</option>
                  <option value="nonEmpty">Non-Empty</option>
                  <option value="grpcStatus">gRPC Status</option>
                  <option value="wsMessageReceived">WS Message Received</option>
                  <option value="jsonSchema">JSON Schema</option>
                  <optgroup label="Aggregation">
                    <option value="sumGreaterThan">Sum Greater Than</option>
                    <option value="sumLessThan">Sum Less Than</option>
                    <option value="avgGreaterThan">Avg Greater Than</option>
                    <option value="avgLessThan">Avg Less Than</option>
                    <option value="countGreaterThan">Count Greater Than</option>
                    <option value="countEquals">Count Equals</option>
                    <option value="minGreaterThan">Min Greater Than</option>
                    <option value="maxLessThan">Max Less Than</option>
                  </optgroup>
                </select>
                <button onClick={() => removeAssertion(i)} className="text-slate-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
              </div>
              {(assertion.type === 'jsonPath' || assertion.type === 'jsonPathIncludes' || assertion.type === 'jsonPathNotIncludes' || assertion.type === 'greaterThan' || assertion.type === 'lessThan' || assertion.type === 'nonEmpty') && (
                <div className="mb-1.5">
                  <input type="text" value={assertion.path ?? ''} onChange={(e) => updateAssertion(i, 'path', e.target.value)}
                    placeholder="$.path.to.value" className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                  {connectedExtracts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {connectedExtracts.map((ext) => (
                        <button
                          key={`p-${i}-${ext.key}`}
                          onClick={() => updateAssertion(i, 'path', ext.path)}
                          className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-mono text-indigo-600 hover:bg-indigo-100 transition-colors"
                        >
                          {ext.key}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {assertion.type !== 'nonEmpty' && assertion.type !== 'wsMessageReceived' && (
                <div>
                  <input type="text" value={String(assertion.expected ?? '')} onChange={(e) => {
                    const val = e.target.value;
                    const num = Number(val);
                    updateAssertion(i, 'expected', isNaN(num) ? val : num);
                  }}
                    placeholder="Expected value or {{extract.key}}" className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                  {connectedExtracts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {connectedExtracts.map((ext) => (
                        <button
                          key={`e-${i}-${ext.key}`}
                          onClick={() => updateAssertion(i, 'expected', `{{extract.${ext.key}}}`)}
                          className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-mono text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          {'{{' + ext.key + '}}'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}
