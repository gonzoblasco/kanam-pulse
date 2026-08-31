// src/checks/cpu.js
// CPU load health check: load average, core count, heavy processes.

import os from 'node:os';
import { runSafe } from '../core/exec.js';

/**
 * Get CPU load average and normalize against core count.
 * @returns {{cores:number, load1:number, load5:number, load15:number, normalized1:number}}
 */
function getLoad() {
  const [load1, load5, load15] = os.loadavg();
  const cores = os.cpus().length;
  return {
    cores,
    load1,
    load5,
    load15,
    // load1 as fraction of cores; <1 idling, >1 saturated
    normalized1: cores > 0 ? load1 / cores : load1,
  };
}

/**
 * Get top CPU-consuming processes, excluding the current process.
 * @param {number} [limit]
 * @returns {Promise<Array<{pid:string, command:string, cpuPct:number}|null>>}
 */
async function getTopProcesses(limit = 5) {
  const res = await runSafe(`ps -Aceo pid,pcpu,comm -r | head -${limit + 1}`);
  if (!res) return null;

  const currentPid = process.pid;
  return res.stdout
    .split('\n')
    .slice(1) // skip header
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[0]);
      const cpuPct = Number(parts[1]);
      const command = parts.slice(2).join(' ');
      return { pid, command, cpuPct: Number.isFinite(cpuPct) ? cpuPct : 0 };
    })
    .filter((p) => p.pid !== currentPid); // exclude self
}

/**
 * Run the CPU health check.
 */
export async function checkCpu() {
  const load = getLoad();
  const top = await getTopProcesses(5);
  const { normalized1, cores } = load;

  let score = 100;
  if (normalized1 >= 1.5) score = 30;
  else if (normalized1 >= 1.0) score = 50;
  else if (normalized1 >= 0.75) score = 70;

  const suggestions = [];
  if (normalized1 >= 1.0) {
    suggestions.push({
      priority: normalized1 >= 1.5 ? 'high' : 'medium',
      component: 'cpu',
      action: `CPU load is ${(normalized1 * 100).toFixed(0)}% of ${cores} cores. Heavy processes detected.`,
      impact: 'Closing background processes reduces CPU contention.',
    });
  }

  const heavy = (top || []).filter((p) => p.cpuPct > 10).slice(0, 3);
  if (heavy.length) {
    suggestions.push({
      priority: 'low',
      component: 'cpu',
      action: `Top CPU consumers: ${heavy.map((p) => `${p.command} (${p.cpuPct}%)`).join(', ')}.`,
      impact: 'Reviewing these may reveal background load you forgot about.',
    });
  }

  return {
    score,
    status: score >= 70 ? 'healthy' : 'warning',
    details: {
      normalized1,
      cores,
      loadAverage1: load.load1,
      loadAverage5: load.load5,
      loadAverage15: load.load15,
      topProcesses: top,
    },
    suggestions,
  };
}
