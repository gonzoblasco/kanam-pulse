// src/fix/processes.js
// Safe process management for the --fix mode.
// Lists heavy processes and kills them ONLY with explicit confirmation.
// Never kills: the current process, PID 1, or system-critical processes.

import { runSafe } from '../core/exec.js';

// Processes that should never be killed, even if heavy.
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

// Transient diagnostic commands this tool itself spawns (du, ps, etc.).
// These show up as heavy during a scan but are not real user load.
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

/**
 * List processes sorted by CPU usage, excluding protected/system ones.
 * @param {number} [limit]
 * @returns {Promise<Array<{pid:number, command:string, cpuPct:number, memPct:number}>>}
 */
export async function listHeavyProcesses(limit = 8) {
  const res = await runSafe(
    `ps -Aceo pid,pcpu,pmem,comm -r | head -${limit + 1}`,
  );
  if (!res) return [];

  const currentPid = process.pid;
  const rows = [];

  for (const line of res.stdout.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[0]);
    const cpuPct = Number(parts[1]);
    const memPct = Number(parts[2]);
    const command = parts.slice(3).join(' ');

    // Skip: current process, protected names, diagnostic commands, and anything we can't parse.
    if (pid === currentPid) continue;
    if (PROTECTED.has(command)) continue;
    if (DIAGNOSTIC_COMMANDS.has(command)) continue;
    if (!Number.isFinite(cpuPct) || !Number.isFinite(memPct)) continue;

    rows.push({ pid, command, cpuPct, memPct });
  }

  return rows;
}

/**
 * Kill a process by PID. Only called after explicit confirmation.
 * @param {number} pid
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function killProcess(pid) {
  const res = await runSafe(`kill ${pid} 2>&1`);
  if (!res) {
    return { ok: false, error: 'kill command failed' };
  }
  // kill exits 0 on success; runSafe returns null on non-zero exit.
  return { ok: true };
}

/**
 * Scan for heavy processes worth killing.
 * @param {number} [cpuThreshold] - only flag processes above this CPU %
 * @returns {Promise<Array<{pid:number, command:string, cpuPct:number, memPct:number}>>}
 */
export async function scanHeavyProcesses(cpuThreshold = 20) {
  const all = await listHeavyProcesses(15);
  return all.filter((p) => p.cpuPct >= cpuThreshold);
}
