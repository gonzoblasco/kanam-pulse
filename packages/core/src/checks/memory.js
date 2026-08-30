// src/checks/memory.js
// RAM health check using real macOS `vm_stat` telemetry.
// Technique: parse page counts and compute Activity Monitor-accurate
// memory usage (anonymous - purgeable = app memory).

import os from 'os';
import { runSafe } from '../core/exec.js';

/**
 * Get accurate macOS RAM metrics matching Activity Monitor.
 * @returns {Promise<{total:number, used:number, free:number, percentage:number, appMemory:number, wired:number, compressed:number}|null>}
 */
async function getMemoryStats() {
  const total = os.totalmem();
  const res = await runSafe('vm_stat');
  if (!res) return null;

  const pageSize = parseInt(res.stdout.match(/page size of (\d+) bytes/)?.[1] || 16384, 10);
  const getPages = (key) => {
    const m = res.stdout.match(new RegExp(key + ":\\s+(\\d+)\\."));
    return m ? parseInt(m[1], 10) * pageSize : 0;
  };

  const free = getPages("Pages free") + getPages("Pages speculative");
  const active = getPages("Pages active");
  const wired = getPages("Pages wired down");
  const compressed = getPages("Pages occupied by compressor");
  const purgeable = getPages("Pages purgeable");
  const fileBacked = getPages("File-backed pages");
  const anonymous = getPages("Anonymous pages");

  const appMemory = Math.max(anonymous - purgeable, 0);
  const memoryUsed = appMemory + wired + compressed;
  const availableMem = Math.max(total - memoryUsed, 0);
  const percentage = Math.min(Math.max(Math.round((memoryUsed / total) * 100), 1), 100);

  return {
    total,
    used: memoryUsed,
    free: availableMem,
    percentage,
    appMemory,
    wired,
    compressed,
  };
}

/**
 * Detect memory pressure using the `memory_pressure` command when available.
 * @returns {Promise<string|null>} 'normal' | 'warning' | 'critical' | null
 */
async function getMemoryPressure() {
  const res = await runSafe('memory_pressure 2>/dev/null | tail -1');
  if (!res) return null;
  const out = res.stdout.toLowerCase();
  if (out.includes('critical')) return 'critical';
  if (out.includes('warning')) return 'warning';
  if (out.includes('normal')) return 'normal';
  return null;
}

/**
 * Run the memory health check.
 */
export async function checkMemory() {
  const stats = await getMemoryStats();
  if (!stats) {
    return {
      score: 0,
      status: 'error',
      details: { error: 'Could not read memory stats' },
      suggestions: [],
    };
  }

  const pressure = await getMemoryPressure();
  const pct = stats.percentage;

  let score = 100;
  if (pressure === 'critical' || pct >= 90) score = 20;
  else if (pressure === 'warning' || pct >= 80) score = 40;
  else if (pct >= 70) score = 60;

  const suggestions = [];
  if (pct >= 80) {
    suggestions.push({
      priority: pct >= 90 ? 'high' : 'medium',
      component: 'memory',
      action: `RAM usage is ${pct}% (${(stats.used / (1024 ** 3)).toFixed(1)} GB / ${(stats.total / (1024 ** 3)).toFixed(1)} GB). Close heavy apps or consider more RAM.`,
      impact: 'Reducing memory pressure improves overall responsiveness.',
    });
  }

  return {
    score,
    status: score >= 70 ? 'healthy' : pressure === 'critical' ? 'critical' : 'warning',
    details: { percentage: pct, pressure, ...stats },
    suggestions,
  };
}
