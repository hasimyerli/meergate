'use client';

import { useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { CinemaState, CinemaControls } from '@/hooks/use-cinema-mode';

interface TimelineScrubberProps {
  cinema: CinemaState;
  controls: CinemaControls;
}

const SPEEDS = [0.5, 1, 2, 5];

export function TimelineScrubber({ cinema, controls }: TimelineScrubberProps) {
  const progress = cinema.totalEvents > 0 ? (cinema.currentSeq / cinema.totalEvents) * 100 : 0;

  const handleScrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seq = Math.round(pct * cinema.totalEvents);
      controls.seekTo(seq);
    },
    [cinema.totalEvents, controls],
  );

  const isPlaying = cinema.playback === 'playing';

  return (
    <div className="bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-2.5 flex items-center gap-3">
      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={controls.reset}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          title="Rewind"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={isPlaying ? controls.pause : controls.play}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <button
          onClick={() => controls.seekTo(cinema.totalEvents)}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          title="Skip to end"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div
        className="flex-1 h-2 bg-slate-100 rounded-full cursor-pointer relative group"
        onClick={handleScrub}
      >
        <div
          className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
        {/* Playhead */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%` }}
        />
      </div>

      {/* Seq counter */}
      <span className="text-[10px] font-mono text-slate-400 min-w-[48px] text-right tabular-nums">
        {cinema.currentSeq}/{cinema.totalEvents}
      </span>

      {/* Speed selector */}
      <div className="flex items-center gap-0.5 ml-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => controls.setSpeed(s)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              cinema.speed === s
                ? 'bg-blue-100 text-blue-700'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Mode badge */}
      <span
        className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full ${
          cinema.mode === 'live'
            ? 'bg-red-100 text-red-600'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        {cinema.mode === 'live' ? 'LIVE' : 'REPLAY'}
      </span>

      {/* Completion indicator */}
      {cinema.runCompleted && (
        <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-600">
          DONE
        </span>
      )}
    </div>
  );
}
