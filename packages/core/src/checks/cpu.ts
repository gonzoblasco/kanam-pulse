// src/checks/cpu.ts
// CPU load health check: load average, core count, heavy processes.

import os from 'node:os';
import { runSafe } from '../core/exec.js';
import type { CheckRunResult, CheckSuggestion } from './index.js';

interface LoadInfo {
  cores: number;
  load1: number;
  load5: number;
  load15: number;
  normalized1: number;
}

interface ProcEntry {
  pid: number;
  command: string;
  cpuPct: number;
}

function getLoad(): LoadInfo {
  const [load1, load5, load15] = os.loadavg();
  const cores = os.cpus().length;
  return {
    cores,
    load1,
    load5,
    load15,
    normalized1: cores > 0 ? load1 / cores : load1,
  };
}

async function getTopProcesses(limit = 5): Promise<ProcEntry[] | null> {
  const res = await runSafe(`ps -Aceo pid,pcpu,comm -r | head -${limit + 1}`);
  if (!res) return null;

  const currentPid = process.pid;
  return res.stdout
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line): ProcEntry => {
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[0]);
      const cpuPct = Number(parts[1]);
      const command = parts.slice(2).join(' ');
      return { pid, command, cpuPct: Number.isFinite(cpuPct) ? cpuPct : 0 };
    })
    .filter((p) => p.pid !== currentPid);
}

export async function checkCpu(): Promise<CheckRunResult> {
  const load = getLoad();
  const top = await getTopProcesses(5);
  const { normalized1, cores } = load;

  let score = 100;
  if (normalized1 >= 1.5) score = 30;
  else if (normalized1 >= 1.0) score = 50;
  else if (normalized1 >= 0.75) score = 70;

  const suggestions: CheckSuggestion[] = [];
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
