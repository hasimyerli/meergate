'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import type { ProtoField } from './grpc-service-picker';

interface ResponseTreeProps {
  fields: ProtoField[];
  onAddExtract: (key: string, path: string) => void;
  prefix?: string;
}

function FieldNode({
  field,
  prefix,
  onAddExtract,
}: {
  field: ProtoField;
  prefix: string;
  onAddExtract: (key: string, path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const jsonPath = field.repeated
    ? `${prefix}.${field.name}[0]`
    : `${prefix}.${field.name}`;

  const extractKey = field.name;

  const hasChildren = field.type === 'message' && field.messageFields && field.messageFields.length > 0;

  return (
    <div>
      <div className="group flex items-center gap-1 py-0.5 hover:bg-indigo-50/50 rounded px-1 -mx-1 transition-colors">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        <span className="text-xs text-slate-700 font-mono">{field.name}</span>
        <span className="text-[10px] text-slate-400">
          {field.repeated ? `[${field.type}]` : field.type}
        </span>

        <button
          type="button"
          onClick={() => onAddExtract(extractKey, jsonPath)}
          title={`Add to extract: ${jsonPath}`}
          className="ml-auto opacity-0 group-hover:opacity-100 rounded p-0.5 text-indigo-500 hover:bg-indigo-100 transition-all"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {expanded && hasChildren && (
        <div className="pl-4 border-l border-slate-100 ml-1.5">
          {field.messageFields!.map((child) => (
            <FieldNode
              key={child.name}
              field={child}
              prefix={field.repeated ? `${prefix}.${field.name}[0]` : `${prefix}.${field.name}`}
              onAddExtract={onAddExtract}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ResponseTree({ fields, onAddExtract, prefix = '$' }: ResponseTreeProps) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
        Response Fields
        <span className="ml-1 font-normal normal-case text-slate-300">(click + to extract)</span>
      </label>
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2 max-h-48 overflow-y-auto">
        {fields.map((field) => (
          <FieldNode
            key={field.name}
            field={field}
            prefix={prefix}
            onAddExtract={onAddExtract}
          />
        ))}
      </div>
    </div>
  );
}
