'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { RunEvent } from './use-run-events';

/* ─── Types ─── */
export type CinemaNodeStatus = 'waiting' | 'running' | 'passed' | 'failed' | 'error' | 'skipped';

export interface NodeCinemaState {
  status: CinemaNodeStatus;
  durationMs?: number;
  assertions?: { name: string; passed: boolean; expected?: unknown; actual?: unknown }[];
  extractedData?: Record<string, unknown>;
}

export interface EdgeFlow {
  id: string;
  sourceStepIndex: number;
  targetStepIndex: number;
  key: string;
  value: unknown;
  startedAt: number; // timestamp ms
}

export interface SpotlightData {
  stepIndex: number;
  stepName: string;
  assertion: { name: string; passed: boolean; expected?: unknown; actual?: unknown };
  ts: number;
}

export type PlaybackState = 'playing' | 'paused' | 'stopped';

export interface CinemaState {
  active: boolean;
  mode: 'live' | 'replay';
  playback: PlaybackState;
  speed: number;
  currentSeq: number;
  totalEvents: number;
  nodeStates: Map<number, NodeCinemaState>;
  activeFlows: EdgeFlow[];
  spotlight: SpotlightData | null;
  runCompleted: boolean;
}

export interface CinemaControls {
  activate: (mode: 'live' | 'replay') => void;
  deactivate: () => void;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  seekTo: (seq: number) => void;
  reset: () => void;
  processEvent: (event: RunEvent) => void;
  loadReplayData: (steps: ReplayStep[]) => void;
}

export interface ReplayStep {
  stepIndex: number;
  stepName: string;
  stepType: string;
  status: string;
  durationMs?: number;
  startedAt?: string;
  assertions?: { name: string; passed: boolean; expected?: unknown; actual?: unknown }[];
}

const FLOW_LIFETIME_MS = 2500;
const SPOTLIGHT_LIFETIME_MS = 1500;

function initialState(): CinemaState {
  return {
    active: false,
    mode: 'live',
    playback: 'stopped',
    speed: 1,
    currentSeq: 0,
    totalEvents: 0,
    nodeStates: new Map(),
    activeFlows: [],
    spotlight: null,
    runCompleted: false,
  };
}

/* ─── Hook ─── */
export function useCinemaMode(totalSteps: number): [CinemaState, CinemaControls] {
  const [state, setState] = useState<CinemaState>(initialState);
  const replayEventsRef = useRef<RunEvent[]>([]);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowIdRef = useRef(0);

  // Cleanup expired flows and spotlight
  useEffect(() => {
    if (!state.active) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setState((prev) => {
        let changed = false;
        const flows = prev.activeFlows.filter((f) => {
          if (now - f.startedAt > FLOW_LIFETIME_MS) {
            changed = true;
            return false;
          }
          return true;
        });
        let spotlight = prev.spotlight;
        if (spotlight && now - spotlight.ts > SPOTLIGHT_LIFETIME_MS) {
          spotlight = null;
          changed = true;
        }
        if (!changed) return prev;
        return { ...prev, activeFlows: flows, spotlight };
      });
    }, 200);
    return () => clearInterval(interval);
  }, [state.active]);

  const activate = useCallback((mode: 'live' | 'replay') => {
    setState((prev) => {
      const nodeStates = new Map<number, NodeCinemaState>();
      for (let i = 0; i < totalSteps; i++) {
        nodeStates.set(i, { status: 'waiting' });
      }
      return {
        ...prev,
        active: true,
        mode,
        playback: mode === 'live' ? 'playing' : 'paused',
        speed: 1,
        currentSeq: 0,
        totalEvents: 0,
        nodeStates,
        activeFlows: [],
        spotlight: null,
        runCompleted: false,
      };
    });
  }, [totalSteps]);

  const deactivate = useCallback(() => {
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    replayEventsRef.current = [];
    setState(initialState);
  }, []);

  const processEvent = useCallback((evt: RunEvent) => {
    setState((prev) => {
      if (!prev.active) return prev;

      const nodeStates = new Map(prev.nodeStates);
      let activeFlows = [...prev.activeFlows];
      let spotlight = prev.spotlight;
      let runCompleted = prev.runCompleted;

      const payload = evt.payload;

      switch (evt.type) {
        case 'step_started': {
          const idx = payload.step_index as number;
          nodeStates.set(idx, {
            ...nodeStates.get(idx),
            status: 'running',
          });
          break;
        }
        case 'step_completed': {
          const idx = payload.step_index as number;
          const status = payload.status as string;
          const existing = nodeStates.get(idx) ?? { status: 'waiting' };
          nodeStates.set(idx, {
            ...existing,
            status: status as CinemaNodeStatus,
            durationMs: payload.duration_ms as number | undefined,
          });
          break;
        }
        case 'assertion_evaluated': {
          const idx = payload.step_index as number;
          const existing = nodeStates.get(idx) ?? { status: 'running' };
          const assertion = {
            name: payload.name as string,
            passed: payload.passed as boolean,
            expected: payload.expected,
            actual: payload.actual,
          };
          const assertions = [...(existing.assertions ?? []), assertion];
          nodeStates.set(idx, { ...existing, assertions });

          spotlight = {
            stepIndex: idx,
            stepName: payload.step_name as string,
            assertion,
            ts: Date.now(),
          };
          break;
        }
        case 'data_extracted': {
          const idx = payload.step_index as number;
          const existing = nodeStates.get(idx) ?? { status: 'running' };
          const extractedData = { ...(existing.extractedData ?? {}), [payload.key as string]: payload.value };
          nodeStates.set(idx, { ...existing, extractedData });

          flowIdRef.current++;
          activeFlows.push({
            id: `flow-${flowIdRef.current}`,
            sourceStepIndex: idx,
            targetStepIndex: -1, // Will be resolved by the cinema overlay from edges
            key: payload.key as string,
            value: payload.value,
            startedAt: Date.now(),
          });
          break;
        }
        case 'run_completed': {
          runCompleted = true;
          break;
        }
      }

      return {
        ...prev,
        currentSeq: evt.seq,
        totalEvents: prev.totalEvents + 1,
        nodeStates,
        activeFlows,
        spotlight,
        runCompleted,
      };
    });
  }, []);

  const play = useCallback(() => {
    setState((prev) => {
      if (!prev.active) return prev;
      if (prev.mode === 'replay') {
        scheduleNextReplayEvent(prev.currentSeq, prev.speed);
      }
      return { ...prev, playback: 'playing' };
    });
  }, []);

  const pause = useCallback(() => {
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    setState((prev) => ({ ...prev, playback: 'paused' }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);

  const seekTo = useCallback((seq: number) => {
    // Replay all events up to seq
    const events = replayEventsRef.current;
    const nodeStates = new Map<number, NodeCinemaState>();
    for (let i = 0; i < totalSteps; i++) {
      nodeStates.set(i, { status: 'waiting' });
    }
    let runCompleted = false;

    for (const evt of events) {
      if (evt.seq > seq) break;
      const payload = evt.payload;
      switch (evt.type) {
        case 'step_started': {
          const idx = payload.step_index as number;
          nodeStates.set(idx, { ...nodeStates.get(idx), status: 'running' });
          break;
        }
        case 'step_completed': {
          const idx = payload.step_index as number;
          const existing = nodeStates.get(idx) ?? { status: 'waiting' };
          nodeStates.set(idx, {
            ...existing,
            status: payload.status as CinemaNodeStatus,
            durationMs: payload.duration_ms as number | undefined,
          });
          break;
        }
        case 'assertion_evaluated': {
          const idx = payload.step_index as number;
          const existing = nodeStates.get(idx) ?? { status: 'running' };
          const assertion = {
            name: payload.name as string,
            passed: payload.passed as boolean,
            expected: payload.expected,
            actual: payload.actual,
          };
          nodeStates.set(idx, { ...existing, assertions: [...(existing.assertions ?? []), assertion] });
          break;
        }
        case 'data_extracted': {
          const idx = payload.step_index as number;
          const existing = nodeStates.get(idx) ?? { status: 'running' };
          const extractedData = { ...(existing.extractedData ?? {}), [payload.key as string]: payload.value };
          nodeStates.set(idx, { ...existing, extractedData });
          break;
        }
        case 'run_completed':
          runCompleted = true;
          break;
      }
    }

    setState((prev) => ({
      ...prev,
      currentSeq: seq,
      nodeStates,
      activeFlows: [],
      spotlight: null,
      runCompleted,
    }));
  }, [totalSteps]);

  const reset = useCallback(() => {
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    const nodeStates = new Map<number, NodeCinemaState>();
    for (let i = 0; i < totalSteps; i++) {
      nodeStates.set(i, { status: 'waiting' });
    }
    setState((prev) => ({
      ...prev,
      currentSeq: 0,
      nodeStates,
      activeFlows: [],
      spotlight: null,
      runCompleted: false,
      playback: 'stopped',
    }));
  }, [totalSteps]);

  // Load replay data — convert step results to synthetic events
  const loadReplayData = useCallback((steps: ReplayStep[]) => {
    const events: RunEvent[] = [];
    let seq = 0;

    // Sort by startedAt time if available
    const sortedSteps = [...steps].sort((a, b) => {
      if (a.startedAt && b.startedAt) return a.startedAt.localeCompare(b.startedAt);
      return a.stepIndex - b.stepIndex;
    });

    for (const step of sortedSteps) {
      seq++;
      events.push({
        type: 'step_started',
        run_id: '',
        ts: step.startedAt ?? '',
        seq,
        payload: {
          step_index: step.stepIndex,
          step_name: step.stepName,
          step_type: step.stepType,
          phase: 'main',
        },
      });

      if (step.assertions) {
        for (const a of step.assertions) {
          seq++;
          events.push({
            type: 'assertion_evaluated',
            run_id: '',
            ts: '',
            seq,
            payload: {
              step_index: step.stepIndex,
              step_name: step.stepName,
              name: a.name,
              passed: a.passed,
              expected: a.expected,
              actual: a.actual,
            },
          });
        }
      }

      seq++;
      events.push({
        type: 'step_completed',
        run_id: '',
        ts: '',
        seq,
        payload: {
          step_index: step.stepIndex,
          step_name: step.stepName,
          step_type: step.stepType,
          status: step.status,
          duration_ms: step.durationMs,
        },
      });
    }

    seq++;
    events.push({
      type: 'run_completed',
      run_id: '',
      ts: '',
      seq,
      payload: {},
    });

    replayEventsRef.current = events;
    setState((prev) => ({ ...prev, totalEvents: events.length }));
  }, []);

  function scheduleNextReplayEvent(currentSeq: number, speed: number) {
    const events = replayEventsRef.current;
    const nextIdx = events.findIndex((e) => e.seq > currentSeq);
    if (nextIdx < 0) return;

    const next = events[nextIdx];
    // Calculate delay from timestamps if available, otherwise use fixed interval
    let delay = 300; // Default 300ms between events
    if (nextIdx > 0) {
      const prev = events[nextIdx - 1];
      if (next.ts && prev.ts) {
        const diff = new Date(next.ts).getTime() - new Date(prev.ts).getTime();
        if (diff > 0 && diff < 30000) delay = diff; // Cap at 30s
      }
    }
    delay = Math.max(50, delay / speed);

    replayTimerRef.current = setTimeout(() => {
      processEvent(next);
      setState((s) => {
        if (s.playback === 'playing' && s.mode === 'replay') {
          scheduleNextReplayEvent(next.seq, s.speed);
        }
        return s;
      });
    }, delay);
  }

  const controls: CinemaControls = {
    activate,
    deactivate,
    play,
    pause,
    setSpeed,
    seekTo,
    reset,
    processEvent,
    loadReplayData,
  };

  return [state, controls];
}
