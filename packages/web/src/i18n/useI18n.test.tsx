// src/i18n/useI18n.test.tsx
// Unit tests for the centralized i18n layer:
//   - default locale is Spanish (SPEC: UI strings Spanish by default)
//   - the English pack has exactly the same keys as the Spanish one
//   - setLocale() switches translations for all mounted consumers and
//     persists the choice to localStorage

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useI18n, setLocale, getLocale } from './useI18n';
import { strings } from './strings';

function Probe({ prefix }: { prefix?: string }) {
  const { locale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="scan">{t('fixes.scan')}</span>
      <span data-testid="tpl">
        {t('fixes.confirmMessage', { cacheCount: 2, processCount: 1, targets: 'X' })}
      </span>
      {prefix ? <span data-testid="prefix">{t('fixes.freed')}</span> : null}
    </div>
  );
}

afterEach(() => {
  act(() => setLocale('es'));
  window.localStorage.removeItem('locale');
  document.body.innerHTML = '';
});

describe('i18n', () => {
  it('defaults to Spanish and renders Spanish strings', () => {
    render(<Probe />);
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    expect(screen.getByTestId('scan')).toHaveTextContent('Escanear');
  });

  it('switches to English via setLocale and re-renders consumers', () => {
    render(<Probe />);
    expect(screen.getByTestId('scan')).toHaveTextContent('Escanear');

    act(() => setLocale('en'));

    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('scan')).toHaveTextContent('Scan');
    // The choice is persisted for the next page load.
    expect(window.localStorage.getItem('locale')).toBe('en');
  });

  it('keeps the English and Spanish packs in key parity', () => {
    const esKeys = Object.keys(strings.es).sort();
    const enKeys = Object.keys(strings.en).sort();
    expect(enKeys).toEqual(esKeys);
  });

  it('getLocale reflects the active locale', () => {
    expect(getLocale()).toBe('es');
    act(() => setLocale('en'));
    expect(getLocale()).toBe('en');
  });

  it('substitutes {placeholder} tokens from vars', () => {
    render(<Probe />);
    const tpl = screen.getByTestId('tpl');
    expect(tpl).toHaveTextContent(
      'Esto liberará 2 objetivo(s) de caché y terminará 1 proceso(s): X. Esta acción no se puede deshacer.',
    );
  });

  it('reads a persisted English choice from localStorage on first access', async () => {
    // getLocale() is cached per module instance; simulate a fresh page load
    // (fresh module registry) so the persisted value is read on first access.
    window.localStorage.setItem('locale', 'en');
    vi.resetModules();
    await import('./strings');
    const fresh = await import('./useI18n');

    expect(fresh.getLocale()).toBe('en');
  });
});
