'use client';

import { Globe, Server, Wifi, Clock, CheckCircle, Monitor } from 'lucide-react';
import { useState } from 'react';

interface StepPaletteProps {
  onAddStep: (type: string) => void;
}

const stepTypes = [
  { type: 'apiCall', label: 'API', description: 'REST API request', icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
  { type: 'grpcCall', label: 'gRPC', description: 'gRPC service call', icon: Server, color: 'text-purple-600', bg: 'bg-purple-50 hover:bg-purple-100 border-purple-200' },
  { type: 'wsSubscribe', label: 'WS', description: 'WebSocket subscription', icon: Wifi, color: 'text-green-600', bg: 'bg-green-50 hover:bg-green-100 border-green-200' },
  { type: 'browserAction', label: 'Browser', description: 'UI interaction', icon: Monitor, color: 'text-indigo-600', bg: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200' },
  { type: 'waitUntil', label: 'Wait', description: 'Delay execution', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200' },
  { type: 'assert', label: 'Assert', description: 'Standalone check', icon: CheckCircle, color: 'text-rose-600', bg: 'bg-rose-50 hover:bg-rose-100 border-rose-200' },
];

export function StepPalette({ onAddStep }: StepPaletteProps) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  return (
    <div className="w-[72px] flex-shrink-0 border-r border-slate-200 bg-slate-50/50 flex flex-col items-center py-3 gap-2">
      {stepTypes.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.type} className="relative">
            <button
              onClick={() => onAddStep(item.type)}
              onMouseEnter={() => setHoveredType(item.type)}
              onMouseLeave={() => setHoveredType(null)}
              className={`flex flex-col items-center justify-center gap-1 h-14 w-14 rounded-lg border transition-all ${item.color} ${item.bg}`}
              title={`Add ${item.label} step`}
            >
              <Icon className="h-[22px] w-[22px]" />
              <span className="text-[9px] font-semibold leading-none">{item.label}</span>
            </button>
            {hoveredType === item.type && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap">
                <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg">
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-slate-400 text-[10px]">{item.description}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
