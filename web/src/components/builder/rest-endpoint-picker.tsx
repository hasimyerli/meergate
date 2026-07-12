'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';

export interface RestEndpointInfo {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: Array<{ name: string; in: string; required: boolean; type: string }>;
  requestBody?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
}

export interface RestServiceInfo {
  id: string;
  name: string;
  domain: string;
  target: string;
  endpoints: RestEndpointInfo[];
}

interface RestEndpointPickerProps {
  services: RestServiceInfo[];
  selectedService: string;
  selectedEndpoint: { method: string; path: string } | null;
  onSelectEndpoint: (service: RestServiceInfo, endpoint: RestEndpointInfo) => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  HEAD: 'bg-slate-100 text-slate-700',
  OPTIONS: 'bg-slate-100 text-slate-700',
};

export function RestEndpointPicker({
  services,
  selectedService,
  selectedEndpoint,
  onSelectEndpoint,
}: RestEndpointPickerProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const allEndpoints = useMemo(() => {
    const items: Array<{ service: RestServiceInfo; endpoint: RestEndpointInfo }> = [];
    for (const svc of services) {
      for (const ep of svc.endpoints) {
        items.push({ service: svc, endpoint: ep });
      }
    }
    return items;
  }, [services]);

  const filtered = useMemo(() => {
    if (!search) return allEndpoints;
    const q = search.toLowerCase();
    return allEndpoints.filter(
      ({ service, endpoint }) =>
        endpoint.path.toLowerCase().includes(q) ||
        endpoint.method.toLowerCase().includes(q) ||
        (endpoint.summary ?? '').toLowerCase().includes(q) ||
        (endpoint.operationId ?? '').toLowerCase().includes(q) ||
        service.name.toLowerCase().includes(q) ||
        service.domain.toLowerCase().includes(q),
    );
  }, [allEndpoints, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, Array<{ service: RestServiceInfo; endpoint: RestEndpointInfo }>> = {};
    for (const item of filtered) {
      const key = item.service.name || item.service.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [filtered]);

  const selectedLabel = selectedEndpoint
    ? `${selectedEndpoint.method} ${selectedEndpoint.path}`
    : null;

  if (services.length === 0 || allEndpoints.length === 0) {
    return null;
  }

  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
        Catalog Endpoints
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-left hover:border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          {selectedLabel ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${METHOD_COLORS[selectedEndpoint!.method] ?? 'bg-slate-100 text-slate-700'}`}>
                {selectedEndpoint!.method}
              </span>
              <span className="text-xs font-mono text-slate-700 truncate">{selectedEndpoint!.path}</span>
            </div>
          ) : (
            <span className="text-slate-400">Browse catalog endpoints...</span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="sticky top-0 bg-white border-b border-slate-100 p-2 z-10">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search endpoints..."
                    autoFocus
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([group, items]) => (
                  <div key={group}>
                    <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 sticky top-[46px] z-[5]">
                      {group}
                      <span className="ml-1 font-normal text-slate-300">({items.length})</span>
                    </div>
                    {items.map(({ service, endpoint }) => {
                      const isSelected =
                        selectedService === service.id &&
                        selectedEndpoint?.method === endpoint.method &&
                        selectedEndpoint?.path === endpoint.path;
                      return (
                        <button
                          key={`${service.id}-${endpoint.method}-${endpoint.path}`}
                          type="button"
                          onClick={() => {
                            onSelectEndpoint(service, endpoint);
                            setOpen(false);
                            setSearch('');
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-blue-50/50 ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${METHOD_COLORS[endpoint.method] ?? 'bg-slate-100 text-slate-700'}`}>
                              {endpoint.method}
                            </span>
                            <span className="text-xs font-mono text-slate-700 truncate">{endpoint.path}</span>
                          </div>
                          {endpoint.summary && (
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate ml-[52px]">{endpoint.summary}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

              {filtered.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">No endpoints found</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
