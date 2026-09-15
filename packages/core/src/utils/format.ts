// src/utils/format.ts
// Pure formatting helpers - keep these pure so they are unit-testable.

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export type ScoreStatus = 'healthy' | 'good' | 'attention' | 'critical';
export type StatusKey = 'healthy' | 'good' | 'attention' | 'critical' | 'warning' | 'degraded' | 'error';

export interface Suggestion {
  priority?: string;
  action: string;
}

/** Format a byte count into a human-readable string. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const str = value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${str} ${BYTE_UNITS[unit]}`;
}

/** Map a 0-100 score to a status label. */
export function scoreStatus(score: number): ScoreStatus {
  if (score >= 85) return 'healthy';
  if (score >= 70) return 'good';
  if (score >= 40) return 'attention';
  return 'critical';
}

/** Human labels for the numeric status we use in checks. */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    healthy: 'HEALTHY',
    good: 'GOOD',
    attention: 'ATTENTION',
    critical: 'CRITICAL',
    warning: 'WARNING',
    degraded: 'DEGRADED',
    error: 'ERROR',
  };
  return map[status] ?? String(status).toUpperCase();
}

/** Render a suggestion as a single-line string. */
export function formatSuggestion(s: Suggestion): string {
  const tag = (s.priority || 'low').toUpperCase().padEnd(7);
  return `[${tag}] ${s.action}`;
}
