'use client';

import { Plus, Minus } from 'lucide-react';
import type { ProtoField } from './grpc-service-picker';

interface ProtoFieldFormProps {
  fields: ProtoField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  depth?: number;
  prefix?: string;
}

export function ProtoFieldForm({ fields, values, onChange, depth = 0, prefix = '' }: ProtoFieldFormProps) {
  const updateField = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value });
  };

  if (fields.length === 0) {
    return <div className="text-xs text-slate-400 italic py-1">No fields</div>;
  }

  return (
    <div className={`space-y-2 ${depth > 0 ? 'pl-3 border-l-2 border-slate-100 ml-1' : ''}`}>
      {fields.map((field) => {
        const fullPath = prefix ? `${prefix}.${field.name}` : field.name;
        const currentValue = values[field.name];

        if (field.type === 'message' && field.messageFields && !field.repeated) {
          return (
            <div key={field.name}>
              <label className="block text-[10px] font-semibold text-purple-600 uppercase tracking-wide mb-1">
                {field.name}
              </label>
              <ProtoFieldForm
                fields={field.messageFields}
                values={(currentValue as Record<string, unknown>) ?? {}}
                onChange={(nested) => updateField(field.name, nested)}
                depth={depth + 1}
                prefix={fullPath}
              />
            </div>
          );
        }

        if (field.repeated) {
          const items = Array.isArray(currentValue) ? currentValue : [];
          return (
            <div key={field.name}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                  {field.name} <span className="text-purple-400 normal-case">(repeated)</span>
                </label>
                <button
                  type="button"
                  onClick={() => updateField(field.name, [...items, field.type === 'message' ? {} : ''])}
                  className="rounded bg-indigo-50 p-0.5 text-indigo-600 hover:bg-indigo-100 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              {items.map((item: unknown, idx: number) => (
                <div key={idx} className="flex items-start gap-1 mb-1">
                  {field.type === 'message' && field.messageFields ? (
                    <div className="flex-1">
                      <ProtoFieldForm
                        fields={field.messageFields}
                        values={(item as Record<string, unknown>) ?? {}}
                        onChange={(nested) => {
                          const next = [...items];
                          next[idx] = nested;
                          updateField(field.name, next);
                        }}
                        depth={depth + 1}
                        prefix={`${fullPath}[${idx}]`}
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={String(item ?? '')}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = e.target.value;
                        updateField(field.name, next);
                      }}
                      placeholder={`{{params.${field.name}}} or value`}
                      className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = items.filter((_: unknown, i: number) => i !== idx);
                      updateField(field.name, next);
                    }}
                    className="rounded p-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors mt-0.5"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          );
        }

        if (field.type === 'bool') {
          return (
            <label key={field.name} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!currentValue}
                onChange={(e) => updateField(field.name, e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-600">{field.name}</span>
            </label>
          );
        }

        const isNumber = field.type === 'int32' || field.type === 'int64' ||
          field.type === 'uint32' || field.type === 'uint64' ||
          field.type === 'float' || field.type === 'double';

        return (
          <div key={field.name}>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">
              {field.name}
              <span className="ml-1 text-slate-300 normal-case">({field.type})</span>
            </label>
            <input
              type="text"
              value={String(currentValue ?? '')}
              onChange={(e) => {
                const val = e.target.value;
                if (isNumber && val && !val.startsWith('{{')) {
                  const num = Number(val);
                  updateField(field.name, isNaN(num) ? val : num);
                } else {
                  updateField(field.name, val);
                }
              }}
              placeholder={`{{params.${field.name}}} or value`}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        );
      })}
    </div>
  );
}
