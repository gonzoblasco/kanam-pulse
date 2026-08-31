// useFixes.ts
// Encapsulates the three consent-gated fixes endpoints:
//   GET  /api/fixes/scan
//   POST /api/fixes/dry-run
//   POST /api/fixes/apply
// Follows the same pattern as useHealthData.ts (loading/error/data).

import { useCallback, useState } from 'react';
import type {
  FixApplyResult,
  FixDryRunResult,
  FixScanResult,
} from '../types/api';

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep the generic message when the body is not JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export interface UseFixes {
  scanResult: FixScanResult | null;
  dryRunResult: FixDryRunResult | null;
  applyResult: FixApplyResult | null;
  scanning: boolean;
  dryRunning: boolean;
  applying: boolean;
  error: string | null;
  scan: () => Promise<void>;
  dryRun: (targets: string[]) => Promise<void>;
  apply: (
    caches: string[],
    processes: number[],
  ) => Promise<FixApplyResult | null>;
  reset: () => void;
}

export function useFixes(): UseFixes {
  const [scanResult, setScanResult] = useState<FixScanResult | null>(null);
  const [dryRunResult, setDryRunResult] = useState<FixDryRunResult | null>(
    null,
  );
  const [applyResult, setApplyResult] = useState<FixApplyResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/fixes/scan');
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const data: FixScanResult = await res.json();
      setScanResult(data);
      // A fresh scan invalidates the previous dry-run estimate.
      setDryRunResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, []);

  const dryRun = useCallback(async (targets: string[]) => {
    setDryRunning(true);
    setError(null);
    try {
      const data = await postJSON<FixDryRunResult>('/api/fixes/dry-run', {
        targets,
      });
      setDryRunResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dry-run failed');
    } finally {
      setDryRunning(false);
    }
  }, []);

  const apply = useCallback(async (caches: string[], processes: number[]) => {
    setApplying(true);
    setError(null);
    try {
      const data = await postJSON<FixApplyResult>('/api/fixes/apply', {
        caches,
        processes,
        confirmed: true,
      });
      setApplyResult(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
      return null;
    } finally {
      setApplying(false);
    }
  }, []);

  const reset = useCallback(() => {
    setScanResult(null);
    setDryRunResult(null);
    setApplyResult(null);
    setError(null);
  }, []);

  return {
    scanResult,
    dryRunResult,
    applyResult,
    scanning,
    dryRunning,
    applying,
    error,
    scan,
    dryRun,
    apply,
    reset,
  };
}
