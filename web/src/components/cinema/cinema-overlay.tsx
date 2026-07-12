'use client';

import type { CinemaState, CinemaControls } from '@/hooks/use-cinema-mode';
import { TimelineScrubber } from './timeline-scrubber';
import { AssertionSpotlight } from './assertion-spotlight';
import { EdgeParticles } from './edge-particles';

interface CinemaOverlayProps {
  cinema: CinemaState;
  controls: CinemaControls;
  /** Map from step name to {sourceStepIndex, targetStepIndexes} for edge particle routing */
  extractEdgeMap: Map<number, number[]>;
}

export function CinemaOverlay({ cinema, controls, extractEdgeMap }: CinemaOverlayProps) {
  if (!cinema.active) return null;

  return (
    <>
      {/* Edge particles layer */}
      <EdgeParticles flows={cinema.activeFlows} extractEdgeMap={extractEdgeMap} />

      {/* Assertion spotlight */}
      {cinema.spotlight && (
        <AssertionSpotlight
          spotlight={cinema.spotlight}
          onDismiss={() => {
            /* spotlight auto-dismisses via the cinema hook timer */
          }}
        />
      )}

      {/* Timeline scrubber at bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-50">
        <TimelineScrubber cinema={cinema} controls={controls} />
      </div>
    </>
  );
}
