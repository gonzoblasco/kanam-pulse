// packages/web/src/i18n/useI18n.ts
// Minimal i18n access hook for the dashboard.
//
// Locale resolution order:
//   1. `localStorage['locale']` ('es' | 'en') - anything else falls back
//   2. default: 'es' (SPEC: UI strings Spanish by default)
//
// `setLocale()` persists the choice and re-renders every mounted consumer.
// `t(key, vars?)` returns the translated string; `{name}` placeholders in the
// template are replaced with the values from `vars` (used for strings built
// from numbers or data, e.g. the confirm message or process labels).
//
// No per-component props are required: the locale is global for the app,
// which keeps the component tree simple. Tests run with the 'es' default.

import { useCallback, useSyncExternalStore } from 'react';
import { strings, type Locale, type TranslationKey } from './strings';

const STORAGE_KEY = 'locale';
const DEFAULT_LOCALE: Locale = 'es';

// Resolved lazily (first getLocale() call) so importing this module never
// touches window.localStorage - some environments (vitest + jsdom on
// Node 22+) hit Node's experimental global getter, which warns on stderr.
let currentLocale: Locale | null = null;
const listeners = new Set<() => void>();

function readStoredLocale(): Locale {
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage : null;
    if (ls && typeof ls.getItem === 'function') {
      return ls.getItem(STORAGE_KEY) === 'en' ? 'en' : DEFAULT_LOCALE;
    }
  } catch {
    // localStorage unavailable (private mode, sandboxed iframe, etc.).
  }
  return DEFAULT_LOCALE;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/** Persist the locale and notify all mounted consumers. */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage : null;
    if (ls && typeof ls.setItem === 'function') {
      ls.setItem(STORAGE_KEY, locale);
    }
  } catch {
    // Keep the in-memory locale even if persistence is unavailable.
  }
  for (const listener of listeners) listener();
}

export function getLocale(): Locale {
  if (currentLocale === null) {
    currentLocale = readStoredLocale();
  }
  return currentLocale;
}

export interface I18n {
  locale: Locale;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function useI18n(): I18n {
  const locale = useSyncExternalStore(subscribe, getLocale);
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let text = strings[locale][key];
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [locale],
  );
  return { locale, t };
}
