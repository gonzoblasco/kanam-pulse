// src/utils/format.js
// Pure formatting helpers - keep these pure so they are unit-testable.

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Format a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
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

/**
 * Map a 0-100 score to a status label.
 * @param {number} score
 * @returns {'healthy'|'good'|'attention'|'critical'}
 */
export function scoreStatus(score) {
  if (score >= 85) return 'healthy';
  if (score >= 70) return 'good';
  if (score >= 40) return 'attention';
  return 'critical';
}

/**
 * Human labels for the numeric status we use in checks.
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(status) {
  const map = {
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

/**
 * Render a suggestion as a single-line string.
 * @param {object} s
 * @returns {string}
 */
export function formatSuggestion(s) {
  const tag = (s.priority || 'low').toUpperCase().padEnd(7);
  return `[${tag}] ${s.action}`;
}
