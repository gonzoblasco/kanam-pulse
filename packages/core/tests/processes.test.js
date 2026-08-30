// tests/processes.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listHeavyProcesses, scanHeavyProcesses, killProcess } from '../src/fix/processes.js';

const mockRunSafe = vi.fn();
vi.mock('../src/core/exec.js', () => ({
  runSafe: (...args) => mockRunSafe(...args),
}));

// Simulate a ps output with a few processes.
const PS_OUTPUT = `  PID %CPU %MEM COMMAND
  123  45.0  2.0  SomeHeavyApp
  456  30.0  1.5  AnotherApp
  789  5.0   0.5  LightApp
  1    0.0   0.0  launchd
  999  50.0  3.0  WindowServer
  1000 60.0  4.0  node`;

describe('listHeavyProcesses', () => {
  beforeEach(() => {
    mockRunSafe.mockReset();
    mockRunSafe.mockResolvedValue({ stdout: PS_OUTPUT, stderr: '' });
  });

  it('parses processes and excludes protected/system ones', async () => {
    const rows = await listHeavyProcesses();
    const commands = rows.map((r) => r.command);
    // launchd and WindowServer are protected - must not appear.
    expect(commands).not.toContain('launchd');
    expect(commands).not.toContain('WindowServer');
    // Heavy user processes should appear.
    expect(commands).toContain('SomeHeavyApp');
    expect(commands).toContain('AnotherApp');
  });

  it('excludes the current process', async () => {
    // Make the current pid match one of the rows (123).
    const origPid = process.pid;
    Object.defineProperty(process, 'pid', { value: 123, configurable: true });
    const rows = await listHeavyProcesses();
    expect(rows.map((r) => r.pid)).not.toContain(123);
    Object.defineProperty(process, 'pid', { value: origPid, configurable: true });
  });

  it('excludes diagnostic commands (du, ps, etc.)', async () => {
    const diagOutput = `  PID %CPU %MEM COMMAND
  200  50.0  2.0  du
  201  40.0  1.0  ps
  202  30.0  1.0  grep
  203  20.0  1.0  RealUserApp`;
    mockRunSafe.mockResolvedValue({ stdout: diagOutput, stderr: '' });
    const rows = await listHeavyProcesses();
    const commands = rows.map((r) => r.command);
    expect(commands).not.toContain('du');
    expect(commands).not.toContain('ps');
    expect(commands).not.toContain('grep');
    expect(commands).toContain('RealUserApp');
  });

  it('returns empty array when ps fails', async () => {
    mockRunSafe.mockResolvedValue(null);
    const rows = await listHeavyProcesses();
    expect(rows).toEqual([]);
  });
});

describe('scanHeavyProcesses', () => {
  beforeEach(() => {
    mockRunSafe.mockReset();
    mockRunSafe.mockResolvedValue({ stdout: PS_OUTPUT, stderr: '' });
  });

  it('only returns processes above the CPU threshold', async () => {
    const heavy = await scanHeavyProcesses(20);
    expect(heavy.length).toBeGreaterThan(0);
    for (const p of heavy) {
      expect(p.cpuPct).toBeGreaterThanOrEqual(20);
    }
    // LightApp (5%) should not be included.
    expect(heavy.map((p) => p.command)).not.toContain('LightApp');
  });
});

describe('killProcess', () => {
  it('returns ok when kill succeeds', async () => {
    mockRunSafe.mockResolvedValue({ stdout: '', stderr: '' });
    const result = await killProcess(123);
    expect(result.ok).toBe(true);
  });

  it('returns error when kill fails', async () => {
    mockRunSafe.mockResolvedValue(null);
    const result = await killProcess(123);
    expect(result.ok).toBe(false);
  });
});
