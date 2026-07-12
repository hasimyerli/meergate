'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import type { SpotlightData } from '@/hooks/use-cinema-mode';

interface AssertionSpotlightProps {
  spotlight: SpotlightData;
  onDismiss: () => void;
}

export function AssertionSpotlight({ spotlight, onDismiss }: AssertionSpotlightProps) {
  const { assertion, stepName } = spotlight;
  const passed = assertion.passed;

  return (
    <div
      className="absolute top-4 right-4 z-50 cinema-spotlight-panel cursor-pointer"
      onClick={onDismiss}
    >
      <div
        className={`rounded-lg border shadow-lg p-3 min-w-[240px] max-w-[340px] ${
          passed
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {passed ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-700 truncate">{stepName}</span>
        </div>

        {/* Assertion name */}
        <div className="text-[11px] font-medium text-slate-600 mb-1.5">{assertion.name}</div>

        {/* Expected vs Actual */}
        {!passed && (
          <div className="space-y-1 text-[10px]">
            <div className="flex gap-2">
              <span className="text-slate-400 font-medium min-w-[52px]">Expected:</span>
              <span className="font-mono text-emerald-700 break-all">
                {formatValue(assertion.expected)}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 font-medium min-w-[52px]">Actual:</span>
              <span className="font-mono text-red-700 break-all">
                {formatValue(assertion.actual)}
              </span>
            </div>
          </div>
        )}

        {/* Confetti for passed */}
        {passed && <div className="relative cinema-confetti" />}
      </div>
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === undefined || val === null) return 'null';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
