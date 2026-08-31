// tests/audit-explain.test.js
// POST /api/audit/explain: optional Ollama-powered audit summary.
// The core's isOllamaAvailable/explainAudit are mocked so tests never touch
// a real (or missing) local Ollama instance.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kanam-pulse/core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runBattery: vi.fn(),
    isOllamaAvailable: vi.fn(),
    explainAudit: vi.fn(),
  };
});

import { explainAudit, isOllamaAvailable, runBattery } from '@kanam-pulse/core';
import { buildApp } from '../src/app.js';

const sampleBattery = {
  overall: 88,
  status: 'healthy',
  timestamp: '2026-08-30T00:00:00.000Z',
  checks: [
    {
      id: 'disk',
      name: 'Disk / Storage',
      score: 88,
      status: 'healthy',
      details: {},
      suggestions: [],
    },
  ],
  runInfo: { elapsedMs: 12, total: 1, passed: 1, warnings: 0, errors: 0 },
};

describe('POST /api/audit/explain', () => {
  beforeEach(() => {
    vi.mocked(runBattery).mockReset();
    vi.mocked(isOllamaAvailable).mockReset();
    vi.mocked(explainAudit).mockReset();
    vi.mocked(runBattery).mockResolvedValue(sampleBattery);
  });

  it('returns available:false when Ollama is not running (feature hidden)', async () => {
    vi.mocked(isOllamaAvailable).mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/audit/explain',
      payload: { battery: sampleBattery },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ available: false, error: 'ollama not available' });
    expect(explainAudit).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns available:true with explanation when Ollama answers', async () => {
    vi.mocked(isOllamaAvailable).mockResolvedValue(true);
    vi.mocked(explainAudit).mockResolvedValue({
      ok: true,
      explanation: 'Your system looks good.',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/audit/explain',
      payload: { battery: sampleBattery },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      available: true,
      explanation: 'Your system looks good.',
    });
    expect(explainAudit).toHaveBeenCalledWith(sampleBattery);
    expect(runBattery).not.toHaveBeenCalled();
    await app.close();
  });

  it('propagates the explainAudit error object', async () => {
    vi.mocked(isOllamaAvailable).mockResolvedValue(true);
    vi.mocked(explainAudit).mockResolvedValue({
      ok: false,
      error: 'ollama generate failed: HTTP 500',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/audit/explain',
      payload: { battery: sampleBattery },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      available: true,
      error: 'ollama generate failed: HTTP 500',
    });
    await app.close();
  });

  it('runs a fresh battery when the body has no battery', async () => {
    vi.mocked(isOllamaAvailable).mockResolvedValue(true);
    vi.mocked(explainAudit).mockResolvedValue({
      ok: true,
      explanation: 'Fresh run summary.',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/audit/explain',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      available: true,
      explanation: 'Fresh run summary.',
    });
    expect(runBattery).toHaveBeenCalledTimes(1);
    expect(explainAudit).toHaveBeenCalledWith(sampleBattery);
    await app.close();
  });
});
