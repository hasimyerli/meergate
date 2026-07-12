'use client';

import { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunButtonProps {
  label: string;
  onClick: () => Promise<void>;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

export function RunButton({ label, onClick, variant = 'primary', size = 'sm' }: RunButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-lg font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-[13px]',
        variant === 'primary' &&
          'bg-blue-600 text-white shadow-sm shadow-blue-200 hover:bg-blue-700 active:shadow-none',
        variant === 'secondary' &&
          'bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 active:bg-slate-100',
        variant === 'ghost' &&
          'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200',
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}
