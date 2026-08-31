// src/test/setup.ts
// Vitest setup: registers jest-dom matchers on vitest's expect.
// The /vitest entry is the version meant for vitest (no global `expect`
// available unless globals:true) - it extends @vitest/expect directly.
//
// Also registers the vitest-axe `toHaveNoViolations` matcher used by the
// accessibility tests (src/components/accessibility.test.tsx).

import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import { toHaveNoViolations } from 'vitest-axe/matchers';
import 'vitest-axe/extend-expect';

expect.extend({ toHaveNoViolations });

// ---- window.localStorage shim (jsdom + Node >= 22 quirk) ----
// Node 22+ ships an experimental global `localStorage` getter that, in the
// vitest/jsdom combo, shadows a working Storage: hitting it emits a benign
// "--localstorage-file" warning on stderr and returns undefined. Our i18n
// hook reads and persists the UI locale through window.localStorage, so
// install a real in-memory Storage here (setup runs before any test imports
// a component). Real browsers are unaffected - this only normalizes the
// test environment. The install is descriptor-based and never invokes an
// existing accessor, so it does not trip Node's experimental getter.
function installLocalStorageShim(): void {
  try {
    const win = window as Window & { localStorage?: Storage };
    const desc = Object.getOwnPropertyDescriptor(win, 'localStorage');
    if (desc && 'value' in desc && desc.value && typeof desc.value.getItem === 'function') {
      return; // A working Storage is already installed.
    }

    const store = new Map<string, string>();
    const shim: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
    };
    Object.setPrototypeOf(shim, Storage.prototype);

    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: shim,
    });
  } catch {
    // Some exotic environments guard window as read-only; i18n falls back to
    // the default locale there, so failing to shim is safe.
  }
}
installLocalStorageShim();

// axe-core's color-contrast rule probes canvas 2D context to detect icon
// ligature fonts. jsdom does not implement canvas.getContext, which would
// spam stderr noise on every axe run (and can throw in some jsdom versions).
// The rule cannot compute real contrast in jsdom anyway (no layout engine),
// so axe reports it as "incomplete"; this stub just silences the probe.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(
    contextId: string,
    ..._args: unknown[]
  ) {
    if (contextId === '2d') {
      // Minimal 2D surface sufficient for axe's feature-detection probes.
      const noop = () => undefined;
      return {
        fillRect: noop,
        measureText: () => ({ width: 0 }),
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  };
}
