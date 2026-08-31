// tests/audit-summary.test.js
// "Explain this audit" core module: prompt building (privacy-safe),
// Ollama availability probing, and graceful explain() handling.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAuditSummaryPrompt,
  explainAudit,
  isOllamaAvailable,
} from '../src/audit/summary.js';

// Sample battery carrying hypothetical user paths in details/suggestions.
// The prompt builder must NEVER surface these.
const batteryWithPaths = {
  overall: 62,
  status: 'attention',
  timestamp: '2026-08-30T12:00:00.000Z',
  checks: [
    {
      id: 'disk',
      name: 'Disk / Storage',
      score: 45,
      status: 'attention',
      details: {
        largestFiles: [
          {
            path: '/Users/gonzoblasco/Library/Caches/com.apple.dt.Xcode',
            sizeBytes: 999999,
          },
        ],
      },
      suggestions: [
        {
          priority: 'high',
          action:
            'Clear 12.3 GB from /Users/gonzoblasco/Library/Caches/com.apple.dt.Xcode',
        },
        { priority: 'low', action: 'Review ~/Downloads for old disk images' },
      ],
    },
    {
      id: 'memory',
      name: 'Memory',
      score: 80,
      status: 'healthy',
      details: { note: 'loaded from /Users/gonzoblasco/.config/whatever' },
      suggestions: [],
    },
  ],
  runInfo: { elapsedMs: 120, total: 2, passed: 1, warnings: 1, errors: 0 },
};

const minimalBattery = {
  overall: 91,
  status: 'healthy',
  timestamp: '2026-08-30T12:00:00.000Z',
  checks: [
    {
      id: 'cpu',
      name: 'CPU',
      score: 91,
      status: 'healthy',
      details: {},
      suggestions: [],
    },
  ],
  runInfo: { elapsedMs: 42, total: 1, passed: 1, warnings: 0, errors: 0 },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildAuditSummaryPrompt', () => {
  it('includes the overall score and status', () => {
    const prompt = buildAuditSummaryPrompt(minimalBattery);
    expect(prompt).toContain('91/100');
    expect(prompt).toContain('healthy');
    expect(prompt).toContain('CPU');
    expect(prompt).toContain('91/100 (healthy)');
  });

  it('never leaks user paths, home dir or path-like tokens', () => {
    const prompt = buildAuditSummaryPrompt(batteryWithPaths);
    const home = process.env.HOME;
    // The specific hypothetical paths must not appear.
    expect(prompt).not.toContain('/Users/');
    expect(prompt).not.toContain('/home/');
    expect(prompt).not.toContain('com.apple.dt.Xcode');
    expect(prompt).not.toContain('Library/Caches');
    expect(prompt).not.toContain('.config');
    if (home) {
      expect(prompt).not.toContain(home);
    }
    // The "~" home shorthand should never surface either.
    expect(prompt).not.toMatch(/(^|\s)~/);
    expect(prompt).not.toMatch(/\s~\s/);
  });

  it('still surfaces aggregate suggestion actions', () => {
    const prompt = buildAuditSummaryPrompt(batteryWithPaths);
    expect(prompt).toContain('Clear 12.3 GB');
    expect(prompt).toContain('(high)');
    expect(prompt).toContain('Review');
    expect(prompt).toContain('old disk images');
  });

  it('handles a battery with no checks gracefully', () => {
    const prompt = buildAuditSummaryPrompt({
      overall: 0,
      status: 'error',
      checks: [],
    });
    expect(prompt).toContain('0/100');
    expect(prompt).toContain('error');
    expect(prompt).toContain('(no check data)');
  });
});

describe('isOllamaAvailable', () => {
  it('returns true when /api/tags responds 200 with models array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'qwen3.5:9b-mlx' }] }),
      }),
    );
    expect(await isOllamaAvailable('http://ollama.test')).toBe(true);
  });

  it('returns false when the fetch fails (rejected)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );
    expect(await isOllamaAvailable('http://ollama.test')).toBe(false);
  });

  it('returns false on non-200 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    expect(await isOllamaAvailable('http://ollama.test')).toBe(false);
  });

  it('returns false when payload has no models array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    expect(await isOllamaAvailable('http://ollama.test')).toBe(false);
  });
});

describe('explainAudit', () => {
  it('returns {ok:true} with the response text when Ollama answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: '  Your system looks healthy overall.  ',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await explainAudit(minimalBattery, {
      baseUrl: 'http://ollama.test',
      model: 'm',
      maxTokens: 100,
      timeoutMs: 1000,
    });
    expect(result).toEqual({
      ok: true,
      explanation: 'Your system looks healthy overall.',
    });

    // POST went to /api/generate with the expected shape.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/generate');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'm',
      stream: false,
      options: { num_predict: 100 },
    });
    expect(typeof body.prompt).toBe('string');
    expect(body.prompt).toContain('91/100');
    expect(body.prompt).not.toContain('/Users/');
  });

  it('returns {ok:false,error} when the generate fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );
    const result = await explainAudit(minimalBattery, {
      baseUrl: 'http://ollama.test',
      timeoutMs: 1000,
    });
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('returns {ok:false,error} on HTTP error responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const result = await explainAudit(minimalBattery);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns {ok:false,error} for an invalid battery without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ response: 'x' }) }),
    );
    const result = await explainAudit(null);
    expect(result).toEqual({ ok: false, error: 'invalid battery' });
  });

  it('never throws - catches unexpected errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue({ name: 'AbortError' }));
    const result = await explainAudit(minimalBattery);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('timeout');
  });
});
