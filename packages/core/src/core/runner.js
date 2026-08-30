// src/core/runner.js
// Test orchestration: run a battery of checks in parallel, collect results,
// compute an overall weighted health score.

import { getChecks } from '../checks/index.js';

/**
 * Weights for each check when computing the overall score.
 */
const WEIGHTS = {
  disk: 0.25,
  memory: 0.25,
  cpu: 0.2,
  security: 0.15,
  network: 0.15,
};

/**
 * Run all requested checks (optionally filtered by id or category).
 * Each check may fail gracefully - failed checks score 0 but don't crash the run.
 * @param {string[]} [checkIds] - optional subset of check ids
 * @returns {Promise<{overall:number, status:string, checks:Array, timestamp:string, runInfo:object}>}
 */
export async function runBattery(checkIds = []) {
  const checks = getChecks(checkIds);
  const startedAt = Date.now();

  // Run all checks concurrently, but isolate failures per-check.
  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        const result = await check.run();
        return {
          id: check.id,
          name: check.name,
          ...result,
        };
      } catch (err) {
        // Never let one bad check take down the battery.
        return {
          id: check.id,
          name: check.name,
          score: 0,
          status: 'error',
          details: { error: err.message },
          suggestions: [],
        };
      }
    }),
  );

  const elapsedMs = Date.now() - startedAt;

  // Weighted overall score using only checks that ran successfully.
  const weighted = results.reduce((acc, r) => {
    const w = WEIGHTS[r.id] ?? 0.1;
    return { weightSum: acc.weightSum + w, scoreSum: acc.scoreSum + r.score * w };
  }, { weightSum: 0, scoreSum: 0 });

  const overall = weighted.weightSum > 0
    ? Math.round(weighted.scoreSum / weighted.weightSum)
    : 0;

  const worst = Math.min(...results.map((r) => r.score));
  const status =
    worst < 40 ? 'degraded'
    : worst < 70 ? 'attention'
    : 'healthy';

  return {
    overall,
    status,
    checks: results,
    timestamp: new Date().toISOString(),
    runInfo: {
      elapsedMs,
      total: results.length,
      passed: results.filter((r) => r.status !== 'error' && r.score >= 70).length,
      warnings: results.filter((r) => r.status !== 'error' && r.score < 70).length,
      errors: results.filter((r) => r.status === 'error').length,
    },
  };
}

/**
 * Collect all suggestions across checks, sorted by priority.
 * @param {object} batteryResult
 */
export function collectSuggestions(batteryResult) {
  const order = { high: 0, medium: 1, low: 2 };
  const all = [];
  for (const check of batteryResult.checks) {
    for (const s of check.suggestions || []) {
      all.push({ check: check.id, ...s });
    }
  }
  return all.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
}
