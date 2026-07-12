import { cn } from '@/lib/utils';
import { Check, X, AlertTriangle, Loader2, Clock, SkipForward } from 'lucide-react';

const statusConfig: Record<
  string,
  { bg: string; text: string; ring: string; dot: string; icon: typeof Check }
> = {
  passed: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
    icon: Check,
  },
  failed: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    ring: 'ring-red-200',
    dot: 'bg-red-500',
    icon: X,
  },
  error: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
    icon: AlertTriangle,
  },
  running: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
    dot: 'bg-blue-500',
    icon: Loader2,
  },
  pending: {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    ring: 'ring-slate-200',
    dot: 'bg-slate-400',
    icon: Clock,
  },
  skipped: {
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    ring: 'ring-slate-200',
    dot: 'bg-slate-400',
    icon: SkipForward,
  },
};

export function StatusBadge({
  status,
  size = 'sm',
  label,
}: {
  status: string;
  size?: 'sm' | 'xs';
  label?: string;
}) {
  const config = statusConfig[status] ?? statusConfig.pending!;
  const Icon = config.icon;
  const isRunning = status === 'running';

  if (size === 'xs') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset',
        config.bg, config.text, config.ring,
      )}>
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {isRunning && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-50', config.dot)} />}
          <span className={cn('relative h-1.5 w-1.5 rounded-full', config.dot)} />
        </span>
        {label ?? status}
      </span>
    );
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset',
      config.bg, config.text, config.ring,
    )}>
      <Icon className={cn('h-3 w-3 shrink-0', isRunning && 'animate-spin')} />
      {label ?? status}
    </span>
  );
}
