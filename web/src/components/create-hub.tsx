'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Workflow, FileCode2, ArrowRight, Wand2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface CreateHubProps {
  /** Show the title/subtitle header. Default true. */
  showHeader?: boolean;
}

export function CreateHub({ showHeader = true }: CreateHubProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');

  const handleGenerate = () => {
    const q = prompt.trim();
    router.push(q ? `/builder?prompt=${encodeURIComponent(q)}` : '/builder?ai=1');
  };

  const modes = [
    {
      href: '/builder?ai=1',
      icon: Sparkles,
      title: t.create.aiTitle,
      desc: t.create.aiDesc,
      accent: 'text-violet-600 bg-violet-50 group-hover:bg-violet-100',
      ring: 'hover:border-violet-300',
    },
    {
      href: '/builder',
      icon: Workflow,
      title: t.create.visualTitle,
      desc: t.create.visualDesc,
      accent: 'text-blue-600 bg-blue-50 group-hover:bg-blue-100',
      ring: 'hover:border-blue-300',
    },
    {
      href: '/builder?tab=yaml',
      icon: FileCode2,
      title: t.create.yamlTitle,
      desc: t.create.yamlDesc,
      accent: 'text-slate-600 bg-slate-100 group-hover:bg-slate-200',
      ring: 'hover:border-slate-300',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      {showHeader && (
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{t.create.title}</h2>
          <p className="mx-auto mt-1.5 max-w-xl text-sm text-slate-500">{t.create.subtitle}</p>
        </div>
      )}

      {/* AI prompt */}
      <div className="mt-6">
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Wand2 className="h-[18px] w-[18px]" />
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            rows={1}
            placeholder={t.create.promptPlaceholder}
            className="min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            onClick={handleGenerate}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-[13px] font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            <Sparkles className="h-4 w-4" />
            {t.create.promptCta}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{t.create.orChoose}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors ${m.ring}`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${m.accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-3 flex items-center gap-1 text-sm font-semibold text-slate-900">
                {m.title}
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
