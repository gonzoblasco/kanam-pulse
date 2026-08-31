// src/core/reporter.js
// Output formatter: terminal table + JSON.

import { statusLabel } from '../utils/format.js';
import { summarizeTrend } from './history.js';
import { collectSuggestions } from './runner.js';

const STATUS_COLOR = {
  healthy: '\x1b[32m', // green
  good: '\x1b[36m', // cyan
  attention: '\x1b[33m', // yellow
  warning: '\x1b[33m',
  critical: '\x1b[31m', // red
  degraded: '\x1b[31m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

/**
 * Render a human-readable report to the terminal.
 * @param {object} battery
 */
export function renderTerminal(battery) {
  const lines = [];
  lines.push('');
  lines.push(`${BOLD}System Health Check${RESET}`);
  lines.push(`  ${'-'.repeat(46)}`);
  lines.push('');

  const overallColor = STATUS_COLOR[battery.status] || STATUS_COLOR.attention;
  lines.push(
    `  Overall: ${BOLD}${overallColor}${battery.overall}/100 (${statusLabel(battery.status)})${RESET}`,
  );
  lines.push(
    `  Time:    ${battery.runInfo.elapsedMs} ms | ${battery.runInfo.total} checks`,
  );
  lines.push('');

  for (const check of battery.checks) {
    const color = STATUS_COLOR[check.status] || STATUS_COLOR.attention;
    const score = typeof check.score === 'number' ? check.score : 0;
    lines.push(`  ${check.name}:`);
    lines.push(
      `    ${color}${String(score).padStart(3)}/100  ${statusLabel(check.status)}${RESET}`,
    );
  }

  lines.push('');
  lines.push(`${BOLD}Suggestions (by priority)${RESET}`);
  const suggestions = collectSuggestions(battery);
  if (suggestions.length === 0) {
    lines.push('  No suggestions - system looks good.');
  } else {
    for (const s of suggestions) {
      const color =
        STATUS_COLOR[
          s.priority === 'high'
            ? 'critical'
            : s.priority === 'medium'
              ? 'attention'
              : 'good'
        ] || '';
      lines.push(`  ${color}- [${s.check}] ${s.action}${RESET}`);
    }
  }

  lines.push('');
  lines.push(
    `  ${BOLD}Legend:${RESET} 80+ healthy | 70-79 good | 40-69 attention | <40 critical`,
  );
  lines.push('');
  return lines.join('\n');
}

/**
 * Render the run history as a terminal table.
 * @param {Array<object>} history
 */
export function renderHistory(history) {
  const lines = [];
  lines.push('');
  lines.push(`${BOLD}Run History${RESET}`);
  lines.push(`  ${'-'.repeat(46)}`);
  lines.push('');

  if (history.length === 0) {
    lines.push('  No history yet. Run a health check to start tracking.');
    lines.push('');
    return lines.join('\n');
  }

  const trend = summarizeTrend(history);
  const trendColor =
    trend.direction === 'improving'
      ? STATUS_COLOR.healthy
      : trend.direction === 'declining'
        ? STATUS_COLOR.critical
        : STATUS_COLOR.good;
  lines.push(
    `  Runs: ${trend.count} | Latest: ${trend.latest}/100 | Trend: ${trendColor}${trend.direction}${RESET}`,
  );
  if (trend.delta !== null) {
    lines.push(
      `  Change vs previous: ${trend.delta > 0 ? '+' : ''}${trend.delta}`,
    );
  }
  lines.push('');

  // Show the last 10 runs, most recent last.
  const recent = history.slice(-10);
  lines.push(`  ${'Date'.padEnd(24)}Overall  Status`);
  for (const entry of recent) {
    const date = new Date(entry.timestamp).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const color = STATUS_COLOR[entry.status] || STATUS_COLOR.attention;
    lines.push(
      `  ${date.padEnd(24)} ${String(entry.overall).padStart(3)}/100  ${color}${statusLabel(entry.status)}${RESET}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render a machine-readable JSON report.
 * @param {object} battery
 */
export function renderJson(battery) {
  return JSON.stringify(battery, null, 2);
}
