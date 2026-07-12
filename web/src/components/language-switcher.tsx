'use client';

import { useI18n, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { locale, setLocale } = useI18n();

  const toggle = () => setLocale(locale === 'en' ? 'tr' : 'en');

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold text-slate-400 hover:bg-slate-700/60 hover:text-white mx-auto"
        title={locale === 'en' ? 'Türkçe' : 'English'}
      >
        {locale.toUpperCase()}
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 opacity-0 shadow-lg group-hover:opacity-100 z-[60] border border-slate-700/50">
          {locale === 'en' ? 'Türkçe' : 'English'}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-slate-700/50 p-0.5">
      <LangButton active={locale === 'en'} label="EN" onClick={() => setLocale('en')} />
      <LangButton active={locale === 'tr'} label="TR" onClick={() => setLocale('tr')} />
    </div>
  );
}

function LangButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md px-3 py-1 text-[11px] font-bold transition-colors',
        active
          ? 'bg-slate-600 text-white shadow-sm'
          : 'text-slate-400 hover:text-white',
      )}
    >
      {label}
    </button>
  );
}
