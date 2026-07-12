'use client';

import { StepCard, NotRunStepCard } from './step-card';
import type { StepResultItem, ArtifactItem, ManifestStep } from '@/lib/api';
import { MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunTimelineProps {
  steps: StepResultItem[];
  artifacts: ArtifactItem[];
  manifestSteps?: ManifestStep[];
  onResume?: (stepIndex: number) => void;
  resuming?: boolean;
}

export function RunTimeline({ steps, artifacts, manifestSteps, onResume, resuming }: RunTimelineProps) {
  const executedNames = new Set(steps.map((s) => s.step_name));
  const notRunSteps: { step: ManifestStep; index: number }[] = [];

  if (manifestSteps) {
    manifestSteps.forEach((ms, i) => {
      if (!executedNames.has(ms.name)) {
        notRunSteps.push({ step: ms, index: i });
      }
    });
  }

  const hasNotRun = notRunSteps.length > 0;
  const screenshots = artifacts.filter((a) => a.type === 'screenshot');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold text-slate-700">Step Timeline</h3>
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[10px] text-slate-400 tabular-nums">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="relative space-y-2">
        {steps.length > 1 && (
          <div className="absolute left-[4px] top-6 bottom-6 w-px bg-slate-200" />
        )}

        {steps.map((step, idx) => (
          <div key={step.id} className="relative flex gap-3">
            <div
              className={cn(
                'relative z-10 mt-4 flex h-[10px] w-[10px] shrink-0 rounded-full ring-[3px] ring-white',
                step.status === 'passed' ? 'bg-emerald-500'
                  : step.status === 'failed' || step.status === 'error' ? 'bg-red-500'
                  : step.status === 'running' ? 'bg-blue-500 animate-pulse'
                  : 'bg-slate-300',
              )}
            />
            <div className="flex-1 min-w-0">
              <StepCard step={step} index={idx} onResume={onResume} resuming={resuming} />
            </div>
          </div>
        ))}

        {hasNotRun && (
          <>
            <div className="relative flex items-center gap-3 py-1">
              <MinusCircle className="relative z-10 h-[10px] w-[10px] shrink-0 text-slate-300" />
              <div className="flex flex-1 items-center gap-2">
                <div className="h-px flex-1 border-t border-dashed border-slate-300" />
                <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                  {notRunSteps.length} not executed
                </span>
                <div className="h-px flex-1 border-t border-dashed border-slate-300" />
              </div>
            </div>
            {notRunSteps.map(({ step: ms, index }) => (
              <div key={`notrun-${index}`} className="relative flex gap-3">
                <div className="relative z-10 mt-3.5 h-[10px] w-[10px] shrink-0 rounded-full bg-slate-200 ring-[3px] ring-white" />
                <div className="flex-1 min-w-0">
                  <NotRunStepCard manifestStep={ms} index={index} />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {screenshots.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold text-slate-700">Screenshots</h3>
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] text-slate-400 tabular-nums">{screenshots.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {screenshots.map((a) => (
              <figure key={a.id} className="overflow-hidden rounded-lg border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/png;base64,${a.value}`} alt={a.key} className="block w-full" />
                <figcaption className="truncate px-2 py-1 text-[10px] text-slate-500">{a.key}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
