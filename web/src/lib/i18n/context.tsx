'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import en, { type Translations } from './en';
import tr from './tr';

export type Locale = 'en' | 'tr';

const translations: Record<Locale, Translations> = { en, tr };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: en,
});

const STORAGE_KEY = 'app-locale';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && translations[saved]) {
      setLocaleState(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Returns the locale string for date formatting: 'tr-TR' or 'en-US' */
export function useLocaleString(): string {
  const { locale } = useI18n();
  return locale === 'tr' ? 'tr-TR' : 'en-US';
}
