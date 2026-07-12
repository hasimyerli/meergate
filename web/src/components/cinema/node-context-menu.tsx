'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlayCircle, RotateCcw } from 'lucide-react';

interface NodeContextMenuProps {
  x: number;
  y: number;
  stepIndex: number;
  stepName: string;
  onRerunFromHere: (stepIndex: number) => void;
  onClose: () => void;
}

export function NodeContextMenu({ x, y, stepIndex, stepName, onRerunFromHere, onClose }: NodeContextMenuProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    const handleClick = () => onClose();
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleRerun = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRerunFromHere(stepIndex);
      onClose();
    },
    [stepIndex, onRerunFromHere, onClose],
  );

  return (
    <div
      className={`fixed z-[100] transition-all duration-100 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      style={{ left: x, top: y }}
    >
      <div className="bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[180px]">
        <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          {stepName}
        </div>
        <button
          onClick={handleRerun}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5 text-blue-500" />
          Re-run from this step
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRerunFromHere(0);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <PlayCircle className="h-3.5 w-3.5 text-emerald-500" />
          Re-run entire test
        </button>
      </div>
    </div>
  );
}
