'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SchemaNode {
  field: string;
  type: string;
  sample: string;
  children?: SchemaNode[];
}

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-emerald-50 text-emerald-700',
  number: 'bg-blue-50 text-blue-700',
  boolean: 'bg-amber-50 text-amber-700',
  null: 'bg-slate-100 text-slate-400',
  object: 'bg-violet-50 text-violet-700',
  array: 'bg-cyan-50 text-cyan-700',
};

function inferSchema(value: unknown, field: string = 'root'): SchemaNode {
  if (value === null || value === undefined) {
    return { field, type: 'null', sample: 'null' };
  }
  if (Array.isArray(value)) {
    const children = value.length > 0 ? [inferSchema(value[0], '[0]')] : [];
    return {
      field,
      type: `array[${value.length}]`,
      sample: `${value.length} item${value.length !== 1 ? 's' : ''}`,
      children,
    };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const children = keys.map((k) => inferSchema(obj[k], k));
    return {
      field,
      type: 'object',
      sample: `{${keys.length} field${keys.length !== 1 ? 's' : ''}}`,
      children,
    };
  }
  const type = typeof value;
  const str = String(value);
  const sample = str.length > 80 ? str.slice(0, 77) + '...' : str;
  return { field, type, sample };
}

export function ResponseSchemaTree({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="text-xs text-slate-400 italic py-2">No response data</p>;
  }

  const schema = inferSchema(data);

  return (
    <div className="text-xs font-mono">
      {schema.children && schema.children.length > 0 ? (
        <div className="space-y-0.5">
          {schema.children.map((node, i) => (
            <SchemaNodeRow key={`${node.field}-${i}`} node={node} depth={0} defaultOpen />
          ))}
        </div>
      ) : (
        <SchemaNodeRow node={schema} depth={0} defaultOpen />
      )}
    </div>
  );
}

function SchemaNodeRow({ node, depth, defaultOpen = false }: {
  node: SchemaNode;
  depth: number;
  defaultOpen?: boolean;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-50 group',
          hasChildren && 'cursor-pointer',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        {/* Expand icon */}
        <span className="w-4 shrink-0 flex items-center justify-center">
          {hasChildren ? (
            open ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />
          ) : (
            <span className="h-1 w-1 rounded-full bg-slate-300" />
          )}
        </span>

        {/* Field name */}
        <span className="font-semibold text-slate-800">{node.field}</span>

        {/* Type badge */}
        <span className={cn(
          'rounded px-1.5 py-px text-[9px] font-semibold shrink-0',
          TYPE_COLORS[node.type.split('[')[0]] ?? 'bg-slate-100 text-slate-500',
        )}>
          {node.type}
        </span>

        {/* Sample value */}
        {!hasChildren && (
          <span className="text-slate-400 truncate ml-auto">{node.sample}</span>
        )}
      </div>

      {/* Children */}
      {hasChildren && open && (
        <div>
          {node.children!.map((child, i) => (
            <SchemaNodeRow
              key={`${child.field}-${i}`}
              node={child}
              depth={depth + 1}
              defaultOpen={depth < 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
