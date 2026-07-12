'use client';

import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface YamlPreviewProps {
  manifest: Record<string, unknown>;
}

function toYaml(obj: unknown, indent: number = 0): string {
  const pad = '  '.repeat(indent);

  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') {
    if (obj.includes('{{') || obj.includes(':') || obj.includes('#') || obj.includes('"') || obj.includes("'") || obj === '' || obj.includes('\n')) {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    if (obj.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return `[${obj.map((item) => typeof item === 'string' ? (item.includes(',') || item.includes(':') ? `"${item}"` : item) : item).join(', ')}]`;
    }
    return obj.map((item) => {
      if (typeof item === 'object' && item !== null) {
        const lines = toYaml(item, indent + 1).split('\n');
        return `${pad}- ${lines[0]?.trimStart()}\n${lines.slice(1).map((l) => `${pad}  ${l.trimStart() ? l : ''}`).filter(Boolean).join('\n')}`;
      }
      return `${pad}- ${toYaml(item, indent + 1)}`;
    }).join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value as object).length > 0) {
        return `${pad}${key}:\n${toYaml(value, indent + 1)}`;
      }
      if (Array.isArray(value) && value.length > 0 && value.some((v) => typeof v === 'object')) {
        return `${pad}${key}:\n${toYaml(value, indent + 1)}`;
      }
      return `${pad}${key}: ${toYaml(value, indent + 1)}`;
    }).join('\n');
  }

  return String(obj);
}

export function YamlPreview({ manifest }: YamlPreviewProps) {
  const [copied, setCopied] = useState(false);

  const yaml = useMemo(() => toYaml(manifest), [manifest]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative max-h-64 overflow-y-auto">
      <div className="sticky top-0 right-0 float-right p-2">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-50 shadow-sm transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-slate-700 leading-relaxed whitespace-pre-wrap">{yaml}</pre>
    </div>
  );
}
