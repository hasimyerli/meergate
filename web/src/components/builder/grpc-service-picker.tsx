'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';

export interface ProtoField {
  name: string;
  type: string;
  repeated: boolean;
  messageFields?: ProtoField[];
}

export interface ProtoMethodInfo {
  name: string;
  protoFile?: string;
  usedIn?: number;
  requestType?: string;
  responseType?: string;
  requestFields?: ProtoField[];
  responseFields?: ProtoField[];
}

export interface ProtoServiceInfo {
  fqn: string;
  domain?: string;
  protoFile?: string;
  target?: string;
  methods: ProtoMethodInfo[];
}

interface GrpcServicePickerProps {
  services: ProtoServiceInfo[];
  selectedService: string;
  selectedMethod: string;
  onSelectService: (fqn: string, protoFile: string) => void;
  onSelectMethod: (method: ProtoMethodInfo) => void;
}

function groupByDomain(services: ProtoServiceInfo[]): Record<string, ProtoServiceInfo[]> {
  const groups: Record<string, ProtoServiceInfo[]> = {};
  for (const svc of services) {
    // Use domain from backend if available, otherwise derive from FQN
    let domain = svc.domain ?? '';
    if (!domain) {
      const parts = svc.fqn.split('.');
      domain = parts.length >= 2 ? parts[parts.length - 2]! : 'other';
    }
    const key = domain.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(svc);
  }
  return groups;
}

export function GrpcServicePicker({
  services,
  selectedService,
  selectedMethod,
  onSelectService,
  onSelectMethod,
}: GrpcServicePickerProps) {
  const [search, setSearch] = useState('');
  const [serviceOpen, setServiceOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return services;
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.fqn.toLowerCase().includes(q) ||
        (s.methods ?? []).some((m) => m.name.toLowerCase().includes(q)),
    );
  }, [services, search]);

  const grouped = useMemo(() => groupByDomain(filtered), [filtered]);

  const currentService = services.find((s) => s.fqn === selectedService);
  const shortName = selectedService ? selectedService.split('.').pop() : '';
  const methods = currentService?.methods ?? [];

  return (
    <div className="space-y-3">
      {/* Service selector */}
      <div>
        <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
          Service
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setServiceOpen(!serviceOpen)}
            className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-left hover:border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            {selectedService ? (
              <div className="min-w-0">
                <div className="font-medium text-slate-800">{shortName}</div>
                <div className="text-[10px] text-slate-400 truncate">{selectedService}</div>
              </div>
            ) : (
              <span className="text-slate-400">Select a service...</span>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 ml-2 transition-transform ${serviceOpen ? 'rotate-180' : ''}`} />
          </button>

          {serviceOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setServiceOpen(false)} />
              <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                <div className="sticky top-0 bg-white border-b border-slate-100 p-2 z-10">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search services or methods..."
                      autoFocus
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, svcs]) => (
                  <div key={group}>
                    <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 sticky top-[46px] z-[5]">
                      {group}
                    </div>
                    {svcs.map((svc) => {
                      const methodCount = (svc.methods ?? []).length;
                      const isSelected = svc.fqn === selectedService;
                      return (
                        <button
                          key={svc.fqn}
                          type="button"
                          onClick={() => {
                            onSelectService(svc.fqn, svc.protoFile ?? '');
                            setServiceOpen(false);
                            setSearch('');
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-blue-50/50 ${
                            isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                              {svc.fqn.split('.').pop()}
                            </span>
                            {methodCount > 0 && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                                {methodCount} method{methodCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{svc.fqn}</div>
                          {svc.target && (
                            <div className="text-[9px] text-slate-300 font-mono mt-0.5 truncate">{svc.target}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {filtered.length === 0 && (
                  <div className="p-6 text-center text-xs text-slate-400">No services found</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Method selector */}
      {currentService && methods.length > 0 && (
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
            RPC Method
          </label>
          <select
            value={selectedMethod}
            onChange={(e) => {
              const method = methods.find((m) => m.name === e.target.value);
              if (method) onSelectMethod(method);
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Select method...</option>
            {methods.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}{m.usedIn ? ` (${m.usedIn} test${m.usedIn !== 1 ? 's' : ''})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Fallback: no methods discovered */}
      {currentService && methods.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] text-amber-700">
            No methods discovered for this service. Enter the RPC method name manually below.
          </p>
        </div>
      )}
    </div>
  );
}
