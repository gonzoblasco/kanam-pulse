// tests/cpu.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCpu } from '../src/checks/cpu.js';

// Mock runSafe to return a fixed ps output.
const mockRunSafe = vi.fn();
vi.mock('../src/core/exec.js', () => ({
  runSafe: (...args) => mockRunSafe(...args),
}));

const PS_OUTPUT = `  PID %CPU COMMAND
  123  45.0  SomeHeavyApp
  456  30.0  AnotherApp
  789  5.0   LightApp
  1000 60.0  node`;

describe('checkCpu', () => {
  beforeEach(() => {
    mockRunSafe.mockReset();
    mockRunSafe.mockResolvedValue({ stdout: PS_OUTPUT, stderr: '' });
  });

  it('excludes the current process from the top consumers', async () => {
    // Make the current pid match the node row (1000).
    const origPid = process.pid;
    Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

    const result = await checkCpu();
    const top = result.details.topProcesses || [];
    expect(top.map((p) => p.pid)).not.toContain(1000);

    Object.defineProperty(process, 'pid', {
      value: origPid,
      configurable: true,
    });
  });

  it('returns a score and status', async () => {
    const result = await checkCpu();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['healthy', 'warning', 'critical']).toContain(result.status);
  });
});
