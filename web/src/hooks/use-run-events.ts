'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface RunEvent {
  type: string;
  run_id: string;
  ts: string;
  seq: number;
  payload: Record<string, unknown>;
}

interface ConnectedMessage {
  type: 'connected';
  run_id: string;
  buffered_events: RunEvent[];
}

interface UseRunEventsOptions {
  onEvent?: (event: RunEvent) => void;
  enabled?: boolean;
}

interface UseRunEventsReturn {
  events: RunEvent[];
  connected: boolean;
  error: string | null;
}

function getWsUrl(runId: string): string {
  if (typeof window === 'undefined') return '';

  // Browser WebSocket API can't set custom headers, so pass JWT via query param.
  const token = localStorage.getItem('auth_token') ?? '';
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

  // In production, NEXT_PUBLIC_API_URL points to the API server.
  // In development, Next.js rewrites don't proxy WebSocket upgrades,
  // so we connect directly to the Go backend on port 3001.
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    const proto = envUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = envUrl.replace(/^https?:\/\//, '');
    return `${proto}//${host}/api/runs/${runId}/ws${tokenParam}`;
  }

  // Dev fallback: connect directly to Go backend
  return `ws://localhost:3001/api/runs/${runId}/ws${tokenParam}`;
}

export function useRunEvents(
  runId: string | null,
  options: UseRunEventsOptions = {},
): UseRunEventsReturn {
  const { onEvent, enabled = true } = options;
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reset = useCallback(() => {
    setEvents([]);
    setConnected(false);
    setError(null);
    retriesRef.current = 0;
  }, []);

  useEffect(() => {
    if (!runId || !enabled) {
      reset();
      return;
    }

    let unmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (unmounted) return;
      const url = getWsUrl(runId!);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      ws.onmessage = (e) => {
        if (unmounted) return;
        try {
          const data = JSON.parse(e.data);

          // Handle initial connected message with buffered events
          if (data.type === 'connected') {
            const msg = data as ConnectedMessage;
            if (msg.buffered_events?.length) {
              setEvents((prev) => {
                const seenSeqs = new Set(prev.map((ev) => ev.seq));
                const newEvents = msg.buffered_events.filter((ev) => !seenSeqs.has(ev.seq));
                if (newEvents.length === 0) return prev;
                const merged = [...prev, ...newEvents].sort((a, b) => a.seq - b.seq);
                newEvents.forEach((ev) => onEventRef.current?.(ev));
                return merged;
              });
            }
            return;
          }

          // Handle pong
          if (data.type === 'pong') return;

          // Regular event
          const evt = data as RunEvent;
          setEvents((prev) => [...prev, evt]);
          onEventRef.current?.(evt);
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        if (unmounted) return;
        setError('WebSocket error');
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnected(false);
        wsRef.current = null;

        // Reconnect with exponential backoff, max 10 attempts
        if (retriesRef.current < 10) {
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 10000);
          retriesRef.current++;
          reconnectTimer = setTimeout(connect, delay);
        } else {
          setError('WebSocket connection failed after 10 retries');
        }
      };
    }

    connect();

    // Keepalive ping every 30s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingInterval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [runId, enabled, reset]);

  return { events, connected, error };
}
