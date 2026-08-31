// src/hooks/useFixes.test.tsx
// Hook-level tests for the consent-gated fixes flow. fetch is stubbed
// globally so no server is ever contacted (the tests run offline).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFixes } from './useFixes';
import type { FixScanResult, FixDryRunResult, FixApplyResult } from '../types/api';

const scanResult: FixScanResult = {
  caches: [
    {
      id: 'cache-brew',
      label: 'Homebrew cache',
      path: '/tmp/brew-cache',
      description: 'Old Homebrew downloads',
      sizeBytes: 1024 * 1024 * 50,
    },
  ],
  processes: [{ pid: 7337, command: 'node', cpuPct: 42, memPct: 10 }],
};

const dryRunResult: FixDryRunResult = {
  wouldFreeBytes: 1024 * 1024 * 50,
  caches: [scanResult.caches[0]],
  processes: [],
};

const applyResult: FixApplyResult = {
  freedBytes: 1024 * 1024 * 50,
  killedPids: [],
  errors: [],
};

/** Install a fetch stub that routes on method + URL. */
function stubFetch(handlers: Record<string, (init?: RequestInit) => unknown | Promise<unknown>>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = `${method} ${url}`;
    const handler = handlers[route];
    if (!handler) throw new Error(`unexpected fetch: ${route}`);
    const body = await handler(init);
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('fetch should have been stubbed by this test');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFixes', () => {
  it('fetches the scan and clears any previous dry-run estimate', async () => {
    const fetchMock = stubFetch({ 'GET /api/fixes/scan': () => scanResult });

    const { result } = renderHook(() => useFixes());

    await act(async () => {
      await result.current.scan();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/fixes/scan');
    expect(result.current.scanResult).toEqual(scanResult);
    expect(result.current.dryRunResult).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.scanning).toBe(false);
  });

  it('sends the targets to the dry-run endpoint and stores the estimate', async () => {
    const fetchMock = stubFetch({
      'GET /api/fixes/scan': () => scanResult,
      'POST /api/fixes/dry-run': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          targets: ['cache-brew', '7337'],
        });
        return dryRunResult;
      },
    });

    const { result } = renderHook(() => useFixes());

    await act(async () => {
      await result.current.scan();
      await result.current.dryRun(['cache-brew', '7337']);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fixes/dry-run',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.dryRunResult).toEqual(dryRunResult);
    expect(result.current.error).toBeNull();
  });

  it('applies the selected fixes with confirmed:true', async () => {
    const fetchMock = stubFetch({
      'POST /api/fixes/apply': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          caches: ['cache-brew'],
          processes: [7337],
          confirmed: true,
        });
        return applyResult;
      },
    });

    const { result } = renderHook(() => useFixes());

    let applied: FixApplyResult | null = null;
    await act(async () => {
      applied = await result.current.apply(['cache-brew'], [7337]);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/fixes/apply', expect.anything());
    expect(applied).toEqual(applyResult);
    expect(result.current.applyResult).toEqual(applyResult);
    expect(result.current.applying).toBe(false);
  });

  it('surfaces scan errors and keeps the previous result untouched', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('server offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFixes());

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.error).toBe('server offline');
    expect(result.current.scanResult).toBeNull();
    expect(result.current.scanning).toBe(false);
  });

  it('resets all state back to the initial values', async () => {
    stubFetch({
      'GET /api/fixes/scan': () => scanResult,
      'POST /api/fixes/dry-run': () => dryRunResult,
      'POST /api/fixes/apply': () => applyResult,
    });

    const { result } = renderHook(() => useFixes());

    await act(async () => {
      await result.current.scan();
      await result.current.apply(['cache-brew'], [7337]);
    });
    expect(result.current.scanResult).toEqual(scanResult);
    expect(result.current.applyResult).toEqual(applyResult);

    act(() => result.current.reset());
    await waitFor(() => {
      expect(result.current.scanResult).toBeNull();
      expect(result.current.dryRunResult).toBeNull();
      expect(result.current.applyResult).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
