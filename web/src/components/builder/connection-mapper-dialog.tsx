'use client';

import { useState } from 'react';
import { ArrowRight, Link2, X, CheckCircle } from 'lucide-react';
import type { ProtoField } from './grpc-service-picker';

interface Mapping {
  sourceKey: string;
  targetField: string;
}

interface ConnectionMapperDialogProps {
  sourceName: string;
  targetName: string;
  targetType: string;
  sourceExtracts: Record<string, string>;
  targetRequestFields: ProtoField[];
  onConfirm: (mappings: Mapping[]) => void;
  onSkip: () => void;
}

function flattenFields(fields: ProtoField[], prefix = ''): string[] {
  const result: string[] = [];
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.name}` : f.name;
    if (f.type === 'message' && f.messageFields && !f.repeated) {
      result.push(...flattenFields(f.messageFields, path));
    } else {
      result.push(path);
    }
  }
  return result;
}

export function ConnectionMapperDialog({
  sourceName,
  targetName,
  targetType,
  sourceExtracts,
  targetRequestFields,
  onConfirm,
  onSkip,
}: ConnectionMapperDialogProps) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');

  const sourceKeys = Object.keys(sourceExtracts);
  const targetFields = flattenFields(targetRequestFields);
  const isTargetGrpc = targetType === 'grpcCall' && targetFields.length > 0;

  const addMapping = () => {
    if (!selectedSource || !selectedTarget) return;
    if (mappings.some((m) => m.targetField === selectedTarget)) return;
    setMappings([...mappings, { sourceKey: selectedSource, targetField: selectedTarget }]);
    setSelectedSource('');
    setSelectedTarget('');
  };

  const removeMapping = (idx: number) => {
    setMappings(mappings.filter((_, i) => i !== idx));
  };

  const usedTargets = new Set(mappings.map((m) => m.targetField));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-800">Step Connection</h3>
          </div>
          <button onClick={onSkip} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Connection info */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-md bg-indigo-100 text-indigo-700 px-2 py-1 font-medium">{sourceName}</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="rounded-md bg-purple-100 text-purple-700 px-2 py-1 font-medium">{targetName}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Available extracts from source */}
          <div className="mb-4">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Available from &quot;{sourceName}&quot;
            </label>
            <div className="flex flex-wrap gap-1.5">
              {sourceKeys.map((key) => (
                <span key={key} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-1 text-[11px] font-mono">
                  <CheckCircle className="h-3 w-3" />
                  {key}
                </span>
              ))}
            </div>
          </div>

          {isTargetGrpc ? (
            <>
              {/* Existing mappings */}
              {mappings.length > 0 && (
                <div className="mb-4">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Mappings</label>
                  <div className="space-y-1.5">
                    {mappings.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs">
                        <span className="font-mono text-indigo-700">{'{{extract.' + m.sourceKey + '}}'}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <span className="font-mono text-purple-700">{m.targetField}</span>
                        <button onClick={() => removeMapping(i)} className="ml-auto text-slate-400 hover:text-red-500">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add mapping */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Map to gRPC Input</label>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-400 mb-0.5">Source output</label>
                    <select
                      value={selectedSource}
                      onChange={(e) => setSelectedSource(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Select extract key...</option>
                      {sourceKeys.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 flex-shrink-0 mb-1.5" />
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-400 mb-0.5">Target input</label>
                    <select
                      value={selectedTarget}
                      onChange={(e) => setSelectedTarget(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Select field...</option>
                      {targetFields.filter((f) => !usedTargets.has(f)).map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={addMapping}
                    disabled={!selectedSource || !selectedTarget}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors mb-px"
                  >
                    Add
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-xs text-blue-700 font-medium mb-1">
                These extract keys will be available in &quot;{targetName}&quot;
              </p>
              <p className="text-[11px] text-blue-600">
                Use <code className="bg-blue-100 rounded px-1">{'{{extract.<key>}}'}</code> in assertion paths or expected values.
                The config panel will show these as quick-select options.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button
            onClick={onSkip}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={() => onConfirm(mappings)}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            {mappings.length > 0 ? `Connect with ${mappings.length} mapping${mappings.length > 1 ? 's' : ''}` : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
