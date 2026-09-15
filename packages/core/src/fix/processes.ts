// src/fix/processes.ts
// Safe process management for the --fix mode.
// Lists heavy processes and kills them ONLY with explicit confirmation.
// Never kills: the current process, PID 1, or system-critical processes.

import { runSafe } from '../core/exec.js';

const PROTECTED = new Set([
  'kernel_task',
  'launchd',
  'WindowServer',
  'loginwindow',
  'mds',
  'mds_stores',
  'mdworker',
  'systemd',
  'init',
]);

const DIAGNOSTIC_COMMANDS = new Set([
  'du',
  'ps',
  'grep',
  'awk',
  'sh',
  'bash',
  'zsh',
  'dscacheutil',
  'ping',
  'curl',
  'vm_stat',
  'memory_pressure',
]);

export interface HeavyProcess {
  pid: number;
  command: string;
  cpuPct: number;
  memPct: number;
}

export interface KillResult {
  ok: boolean;
  error?: string;
}

/** List processes sorted by CPU usage, excluding protected/system ones. */
export async function listHeavyProcesses(limit = 8): Promise<HeavyProcess[]> {
  const res = await runSafe(`ps -Aceo pid,pcpu,pmem,comm -r | head -${limit + 1}`);
  if (!res) return [];

  const currentPid = process.pid;
  const rows: HeavyProcess[] = [];

  for (const line of res.stdout.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[0]);
    const cpuPct = Number(parts[1]);
    const memPct = Number(parts[2]);
    const command = parts.slice(3).join(' ');

    if (pid === currentPid) continue;
    if (PROTECTED.has(command)) continue;
    if (DIAGNOSTIC_COMMANDS.has(command)) continue;
    if (!Number.isFinite(cpuPct) || !Number.isFinite(memPct)) continue;

    rows.push({ pid, command, cpuPct, memPct });
  }

  return rows;
}

/** Kill a process by PID. Only called after explicit confirmation. */
export async function killProcess(pid: number): Promise<KillResult> {
  const res = await runSafe(`kill ${pid} 2>&1`);
  if (!res) return { ok: false, error: 'kill command failed' };
  return { ok: true };
}

/** Scan for heavy processes worth killing. */
export async function scanHeavyProcesses(cpuThreshold = 20): Promise<HeavyProcess[]> {
  const all = await listHeavyProcesses(15);
  return all.filter((p) => p.cpuPct >= cpuThreshold);
}
