'use client';

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ManifestStep, StepResultItem } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface RunDagViewerProps {
  manifestSteps: ManifestStep[];
  stepResults: StepResultItem[];
}

/* ── Port TopologicalBatches from Go dag.go ── */
function topologicalBatches(steps: ManifestStep[]): number[][] {
  const nameToIdx = new Map<string, number>();
  steps.forEach((s, i) => nameToIdx.set(s.name, i));

  // Build adjacency: edges[from] = [to1, to2, ...]
  const edges = new Map<number, number[]>();
  const inDegree = new Map<number, number>();
  steps.forEach((_, i) => { inDegree.set(i, 0); });

  steps.forEach((s, i) => {
    for (const dep of s.dependsOn ?? []) {
      const depIdx = nameToIdx.get(dep);
      if (depIdx !== undefined) {
        if (!edges.has(depIdx)) edges.set(depIdx, []);
        edges.get(depIdx)!.push(i);
        inDegree.set(i, (inDegree.get(i) ?? 0) + 1);
      }
    }
  });

  const batches: number[][] = [];
  const remaining = new Set(steps.map((_, i) => i));

  while (remaining.size > 0) {
    const batch: number[] = [];
    for (const n of remaining) {
      if ((inDegree.get(n) ?? 0) === 0) batch.push(n);
    }
    if (batch.length === 0) {
      // Cycle — dump remaining
      batches.push([...remaining]);
      break;
    }
    batches.push(batch);
    for (const n of batch) {
      remaining.delete(n);
      for (const t of edges.get(n) ?? []) {
        inDegree.set(t, (inDegree.get(t) ?? 0) - 1);
      }
    }
  }
  return batches;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  passed:  { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
  failed:  { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  error:   { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  running: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
  pending: { bg: '#f8fafc', border: '#cbd5e1', text: '#64748b' },
};

function buildGraph(manifestSteps: ManifestStep[], stepResults: StepResultItem[]) {
  const batches = topologicalBatches(manifestSteps);
  const resultMap = new Map<string, StepResultItem>();
  stepResults.forEach((sr) => resultMap.set(sr.step_name, sr));

  const NODE_W = 180;
  const NODE_H = 56;
  const GAP_X = 220;
  const GAP_Y = 72;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Position nodes by batch
  batches.forEach((batch, batchIdx) => {
    batch.forEach((stepIdx, posInBatch) => {
      const step = manifestSteps[stepIdx];
      const result = resultMap.get(step.name);
      const status = result?.status ?? 'pending';
      const colors = STATUS_COLORS[status] ?? STATUS_COLORS.pending;

      nodes.push({
        id: `step-${stepIdx}`,
        position: { x: batchIdx * GAP_X, y: posInBatch * GAP_Y },
        data: {
          label: step.name,
          status,
          duration: result?.duration_ms,
          type: step.type,
        },
        style: {
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '8px 12px',
          width: NODE_W,
          minHeight: NODE_H,
          fontSize: '11px',
          color: colors.text,
          fontWeight: 600,
        },
        draggable: false,
        connectable: false,
      });

      // Edges from dependencies
      for (const dep of step.dependsOn ?? []) {
        const depIdx = manifestSteps.findIndex((s) => s.name === dep);
        if (depIdx >= 0) {
          edges.push({
            id: `e-${depIdx}-${stepIdx}`,
            source: `step-${depIdx}`,
            target: `step-${stepIdx}`,
            type: 'smoothstep',
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            animated: status === 'running',
          });
        }
      }
    });
  });

  return { nodes, edges };
}

/* ── Custom node label ── */
function DagNodeLabel({ data }: { data: { label: string; status: string; duration?: number; type: string } }) {
  return (
    <div className="text-center">
      <div className="text-[11px] font-semibold truncate">{data.label}</div>
      <div className="flex items-center justify-center gap-1.5 mt-0.5">
        <span className="text-[9px] uppercase opacity-70">{data.type === 'grpcCall' ? 'gRPC' : data.type === 'apiCall' ? 'REST' : data.type}</span>
        {data.duration != null && (
          <span className="text-[9px] font-mono opacity-70">{formatDuration(data.duration)}</span>
        )}
      </div>
    </div>
  );
}

export function RunDagViewer({ manifestSteps, stepResults }: RunDagViewerProps) {
  const hasDeps = manifestSteps.some((s) => s.dependsOn && s.dependsOn.length > 0);
  const { nodes, edges } = useMemo(
    () => buildGraph(manifestSteps, stepResults),
    [manifestSteps, stepResults],
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    const idx = node.id.replace('step-', '');
    const el = document.getElementById(`step-${idx}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  if (!hasDeps || nodes.length < 2) return null;

  // Compute height based on max batch size
  const batches = topologicalBatches(manifestSteps);
  const maxBatchSize = Math.max(...batches.map((b) => b.length));
  const height = Math.max(160, maxBatchSize * 72 + 40);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100">
        <h3 className="text-xs font-semibold text-slate-700">Dependency Graph</h3>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[9px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: '#6ee7b7' }} />Passed</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: '#fca5a5' }} />Failed</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: '#93c5fd' }} />Running</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: '#cbd5e1' }} />Pending</span>
        </div>
      </div>
      <div style={{ height }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes.map((n) => ({ ...n, data: { ...n.data, label: <DagNodeLabel data={n.data as any} /> } }))}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll={false}
            onNodeClick={onNodeClick}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={0.5} color="#e2e8f0" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
