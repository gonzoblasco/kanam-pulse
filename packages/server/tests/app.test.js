// tests/app.test.js
// Server API tests. The core runner is mocked for /api/run so tests never
// shell out to system commands; everything else uses the real core facade.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kanam-pulse/core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runBattery: vi.fn(),
  };
});

import { CHECKS, runBattery } from '@kanam-pulse/core';
import { buildApp } from '../src/app.js';

describe('buildApp', () => {
  it('is exported as an async factory that returns a fastify instance', async () => {
    const app = await buildApp();
    expect(app).toBeDefined();
    expect(typeof app.inject).toBe('function');
    expect(typeof app.close).toBe('function');
    await app.close();
  });

  it('registers GET routes on the /api prefix', async () => {
    const app = await buildApp();
    const routes = app
      .printRoutes({ commonPrefix: false })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/api/health'),
        expect.stringContaining('/api/checks'),
        expect.stringContaining('/api/run'),
        expect.stringContaining('/api/history'),
        expect.stringContaining('/api/metrics/stream'),
      ]),
    );
    await app.close();
  });

  it('exposes the entrypoint bind address constants as 127.0.0.1', async () => {
    const indexSource = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf-8'),
    );
    expect(indexSource).toMatch(/HOST\s*=\s*['"]127\.0\.0\.1['"]/);
    expect(indexSource).not.toMatch(/0\.0\.0\.0/);
    expect(indexSource).toMatch(/process\.env\.PORT/);
  });
});

describe('GET /api/health', () => {
  it('returns 200 with ok:true and the server package version', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
    await app.close();
  });
});

describe('GET /api/checks', () => {
  it('returns the 5 checks from the core registry', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/checks' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.checks).toHaveLength(5);
    expect(body.checks.map((c) => c.id)).toEqual(CHECKS.map((c) => c.id));
    for (const check of body.checks) {
      expect(check).toHaveProperty('id');
      expect(check).toHaveProperty('name');
      expect(check.run).toBeUndefined();
    }
    await app.close();
  });
});

describe('GET /api/run', () => {
  beforeEach(() => {
    vi.mocked(runBattery).mockReset();
  });

  it('runs the full battery when no checks param is given', async () => {
    vi.mocked(runBattery).mockResolvedValue({
      overall: 88,
      status: 'healthy',
      checks: [],
      timestamp: '2026-08-30T00:00:00.000Z',
      runInfo: { elapsedMs: 12, total: 5, passed: 5, warnings: 0, errors: 0 },
    });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/run' });
    expect(res.statusCode).toBe(200);
    expect(runBattery).toHaveBeenCalledWith([]);
    const body = JSON.parse(res.body);
    expect(body.overall).toBe(88);
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('timestamp');
    await app.close();
  });

  it('passes a parsed subset of check ids to the runner', async () => {
    vi.mocked(runBattery).mockResolvedValue({
      overall: 75,
      status: 'healthy',
      checks: [],
      timestamp: '2026-08-30T00:00:00.000Z',
      runInfo: { elapsedMs: 3, total: 2, passed: 2, warnings: 0, errors: 0 },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/run?checks=disk,memory',
    });
    expect(res.statusCode).toBe(200);
    expect(runBattery).toHaveBeenCalledWith(['disk', 'memory']);
    await app.close();
  });

  it('rejects unknown check ids with 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/run?checks=disk,nope',
    });
    expect(res.statusCode).toBe(400);
    expect(runBattery).not.toHaveBeenCalled();
    await app.close();
  });

  it('propagates runner failures as 500', async () => {
    vi.mocked(runBattery).mockRejectedValue(new Error('battery exploded'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/run' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('GET /api/history', () => {
  it('returns 200 with a history array from the same source as the CLI', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/history' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.history)).toBe(true);
    await app.close();
  });
});

describe('GET /api/metrics/stream', () => {
  it('streams text/event-stream metrics and cleans up on close', async () => {
    const app = await buildApp();
    // Real listen on an ephemeral port: SSE never resolves via fastify.inject.
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address();

    const res = await fetch(`http://127.0.0.1:${port}/api/metrics/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body.getReader();
    const { value } = await reader.read();
    const chunk = Buffer.from(value).toString('utf-8');
    expect(chunk).toContain('event: metrics');
    const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
    const payload = JSON.parse(dataLine.slice('data: '.length));
    expect(payload).toHaveProperty('memory');
    expect(payload).toHaveProperty('load');
    expect(payload.unit).toBe('bytes');

    // Client disconnect: abort the stream so the server's request.raw 'close' fires
    // and clears the setInterval. Then close the Fastify server.
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 500));
    await app.close();
  }, 20000);
});
