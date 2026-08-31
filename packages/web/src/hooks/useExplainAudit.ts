// src/hooks/useExplainAudit.ts
// "Explain this audit" - optional human-language summary of the last health
// run via the local Ollama instance.
//
// Contract with POST /api/audit/explain (packages/server):
//   body  { battery?: HealthRunData }   - omitted to let the server run fresh
//   200   { available: false, error }   - Ollama is not running / no model
//   200   { available: true, explanation } - happy path
//
// The UI keeps the button visible; when the server reports `available: false`
// it surfaces a subtle one-liner and offers a retry. Everything degrades
// gracefully - the audit flow itself never depends on this feature.

import { useCallback, useState } from 'react';
import type { ExplainAuditResponse, HealthRunData } from '../types/api';

export interface UseExplainAudit {
  /** Human-language summary from Ollama (when available). */
  explanation: string | null;
  /** Ollama was reachable and produced a summary. */
  available: boolean | null;
  /** User-facing error message (offline, HTTP failure, empty response). */
  error: string | null;
  loading: boolean;
  explain: (battery?: HealthRunData | null) => Promise<void>;
  reset: () => void;
}

export function useExplainAudit(): UseExplainAudit {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const explain = useCallback(async (battery?: HealthRunData | null) => {
    setLoading(true);
    setError(null);
    setExplanation(null);
    try {
      const body = battery ? { battery } : {};
      const res = await fetch('/api/audit/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      // The endpoint always answers 200 with the contract payload; a non-OK
      // status is a server-level failure we still surface gracefully.
      const data: ExplainAuditResponse = res.ok
        ? ((await res.json()) as ExplainAuditResponse)
        : { available: false, error: `Request failed (${res.status})` };

      setAvailable(Boolean(data.available));
      if (data.explanation) {
        setExplanation(data.explanation);
      } else if (data.error) {
        setError(data.error);
      } else {
        setError('No explanation available');
      }
    } catch (e) {
      setAvailable(false);
      setError(e instanceof Error ? e.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setExplanation(null);
    setAvailable(null);
    setError(null);
    setLoading(false);
  }, []);

  return { explanation, available, error, loading, explain, reset };
}
