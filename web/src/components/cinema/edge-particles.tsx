'use client';

import type { EdgeFlow } from '@/hooks/use-cinema-mode';

interface EdgeParticlesProps {
  flows: EdgeFlow[];
  extractEdgeMap: Map<number, number[]>;
}

export function EdgeParticles({ flows, extractEdgeMap }: EdgeParticlesProps) {
  if (flows.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      {flows.map((flow) => {
        const targets = extractEdgeMap.get(flow.sourceStepIndex) ?? [];
        if (targets.length === 0) return null;

        return targets.map((targetIdx) => (
          <ParticleDot
            key={`${flow.id}-${targetIdx}`}
            flow={flow}
            targetStepIndex={targetIdx}
          />
        ));
      })}
    </div>
  );
}

function ParticleDot({ flow }: { flow: EdgeFlow; targetStepIndex: number }) {
  const age = Date.now() - flow.startedAt;
  const opacity = age < 200 ? age / 200 : age > 2000 ? Math.max(0, 1 - (age - 2000) / 500) : 1;

  return (
    <div
      className="absolute flex items-center gap-1 animate-fadeIn"
      style={{
        opacity,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-300" />
      <span className="text-[9px] font-mono bg-white/90 px-1 py-0.5 rounded shadow-sm text-indigo-700 whitespace-nowrap">
        {flow.key}: {typeof flow.value === 'object' ? JSON.stringify(flow.value) : String(flow.value)}
      </span>
    </div>
  );
}
