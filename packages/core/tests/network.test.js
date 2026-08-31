// tests/network.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkNetwork } from '../src/checks/network.js';

// Mock runSafe to simulate network probe responses deterministically.
const mockRunSafe = vi.fn();
vi.mock('../src/core/exec.js', () => ({
  runSafe: (...args) => mockRunSafe(...args),
}));

// Helper: build a fake ping output with a given latency.
function pingOut(ms) {
  return {
    stdout: `round-trip min/avg/max/stddev = ${ms}.000/${ms}.000/${ms}.000/0.000 ms`,
    stderr: '',
  };
}

describe('checkNetwork', () => {
  beforeEach(() => {
    mockRunSafe.mockReset();
  });

  it('scores healthy when connectivity, ping and DNS all work', async () => {
    mockRunSafe
      .mockResolvedValueOnce({ stdout: '200', stderr: '' }) // curl connectivity
      .mockResolvedValueOnce(pingOut(20)) // ping 1.1.1.1
      .mockResolvedValueOnce(pingOut(25)) // ping 8.8.8.8
      .mockResolvedValueOnce({
        stdout: 'ip_address: 142.250.72.14',
        stderr: '',
      }) // dns google
      .mockResolvedValueOnce({
        stdout: 'ip_address: 104.16.132.229',
        stderr: '',
      }); // dns cloudflare

    const result = await checkNetwork();
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.status).toBe('healthy');
    expect(result.details.connectivity).toBe(true);
  });

  it('scores critical when there is no connectivity', async () => {
    mockRunSafe
      .mockResolvedValueOnce({ stdout: '000', stderr: '' }) // curl fails
      .mockResolvedValueOnce(null) // ping fails
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        stdout: 'ip_address: 142.250.72.14',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: 'ip_address: 104.16.132.229',
        stderr: '',
      });

    const result = await checkNetwork();
    expect(result.score).toBe(0);
    expect(result.status).toBe('critical');
  });

  it('flags high latency', async () => {
    mockRunSafe
      .mockResolvedValueOnce({ stdout: '200', stderr: '' })
      .mockResolvedValueOnce(pingOut(300)) // high latency
      .mockResolvedValueOnce(pingOut(320))
      .mockResolvedValueOnce({
        stdout: 'ip_address: 142.250.72.14',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: 'ip_address: 104.16.132.229',
        stderr: '',
      });

    const result = await checkNetwork();
    expect(result.score).toBeLessThan(70);
    expect(
      result.suggestions.some(
        (s) => s.component === 'network' && /latency/i.test(s.action),
      ),
    ).toBe(true);
  });

  it('flags DNS failures', async () => {
    mockRunSafe
      .mockResolvedValueOnce({ stdout: '200', stderr: '' })
      .mockResolvedValueOnce(pingOut(20))
      .mockResolvedValueOnce(pingOut(25))
      .mockResolvedValueOnce(null) // dns google fails
      .mockResolvedValueOnce({
        stdout: 'ip_address: 104.16.132.229',
        stderr: '',
      });

    const result = await checkNetwork();
    expect(result.score).toBeLessThan(70);
    expect(result.suggestions.some((s) => /DNS/i.test(s.action))).toBe(true);
  });
});
