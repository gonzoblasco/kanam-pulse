// tests/fixes.test.js
// Fix routes with consent (GET /api/fixes/scan, POST /api/fixes/dry-run,
// POST /api/fixes/apply). Every destructive core action is mocked so tests
// never clear real caches or kill real processes.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kanam-pulse/core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSafeCacheTargets: vi.fn(),
    scanSafeCaches: vi.fn(),
    getDirSizeBytes: vi.fn(),
    clearDirContents: vi.fn(),
    scanHeavyProcesses: vi.fn(),
    killProcess: vi.fn(),
  };
});

import { buildApp } from '../src/app.js';
import {
  getSafeCacheTargets,
  scanSafeCaches,
  getDirSizeBytes,
  clearDirContents,
  scanHeavyProcesses,
  killProcess,
} from '@kanam-pulse/core';

const CACHE_TARGETS = [
  {
    id: 'npm-cache',
    label: 'npm cache',
    path: '/home/user/.npm/_cacache',
    description: 'npm package cache (safe to clear, re-downloads on demand)',
  },
  {
    id: 'user-caches',
    label: 'User app caches',
    path: '/home/user/Library/Caches',
    description: 'App caches (regenerable, no user data lost)',
  },
];

const HEAVY_PROCESSES = [
  { pid: 1234, command: 'some-heavy-app', cpuPct: 42, memPct: 8 },
  { pid: 5678, command: 'another-heavy-app', cpuPct: 31, memPct: 3 },
];

beforeEach(() => {
  vi.mocked(getSafeCacheTargets).mockReset();
  vi.mocked(scanSafeCaches).mockReset();
  vi.mocked(getDirSizeBytes).mockReset();
  vi.mocked(clearDirContents).mockReset();
  vi.mocked(scanHeavyProcesses).mockReset();
  vi.mocked(killProcess).mockReset();
});

describe('GET /api/fixes/scan', () => {
  it('returns caches and heavy processes without executing anything destructive', async () => {
    vi.mocked(getSafeCacheTargets).mockResolvedValue(CACHE_TARGETS);
    vi.mocked(scanSafeCaches).mockResolvedValue([
      { ...CACHE_TARGETS[0], sizeBytes: 4096 },
      { ...CACHE_TARGETS[1], sizeBytes: 8192 },
    ]);
    vi.mocked(scanHeavyProcesses).mockResolvedValue(HEAVY_PROCESSES);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/fixes/scan' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.caches)).toBe(true);
    expect(Array.isArray(body.processes)).toBe(true);
    expect(body.caches).toHaveLength(2);
    expect(body.caches[0]).toMatchObject({ id: 'npm-cache', sizeBytes: 4096 });
    expect(body.processes).toHaveLength(2);
    expect(body.processes[0]).toMatchObject({ pid: 1234, command: 'some-heavy-app' });

    expect(scanSafeCaches).toHaveBeenCalledTimes(1);
    expect(scanHeavyProcesses).toHaveBeenCalledWith(20);
    expect(clearDirContents).not.toHaveBeenCalled();
    expect(killProcess).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /api/fixes/dry-run', () => {
  it('reports what each cache would free and which processes would be killed, without running anything', async () => {
    vi.mocked(getSafeCacheTargets).mockResolvedValue(CACHE_TARGETS);
    vi.mocked(getDirSizeBytes).mockImplementation(async (dir) => {
      if (dir === CACHE_TARGETS[0].path) return 2048;
      if (dir === CACHE_TARGETS[1].path) return 1024;
      return 0;
    });
    vi.mocked(scanHeavyProcesses).mockResolvedValue(HEAVY_PROCESSES);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/fixes/dry-run',
      payload: { targets: ['npm-cache', 'user-caches', '1234'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.wouldFreeBytes).toBe(3072);
    expect(body.caches).toHaveLength(2);
    expect(body.caches[0]).toMatchObject({ id: 'npm-cache', sizeBytes: 2048 });
    expect(body.caches[1]).toMatchObject({ id: 'user-caches', sizeBytes: 1024 });
    expect(body.processes).toHaveLength(1);
    expect(body.processes[0]).toMatchObject({ pid: 1234, command: 'some-heavy-app' });

    expect(getDirSizeBytes).toHaveBeenCalledWith(CACHE_TARGETS[0].path);
    expect(getDirSizeBytes).toHaveBeenCalledWith(CACHE_TARGETS[1].path);
    // Dry-run must never execute cleanup or kills.
    expect(clearDirContents).not.toHaveBeenCalled();
    expect(killProcess).not.toHaveBeenCalled();
    await app.close();
  });

  it('ignores pids not present in a fresh heavy-process scan', async () => {
    vi.mocked(getSafeCacheTargets).mockResolvedValue(CACHE_TARGETS);
    vi.mocked(getDirSizeBytes).mockResolvedValue(0);
    vi.mocked(scanHeavyProcesses).mockResolvedValue(HEAVY_PROCESSES);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/fixes/dry-run',
      payload: { targets: ['9999'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.processes).toEqual([]);
    expect(body.wouldFreeBytes).toBe(0);
    await app.close();
  });
});

describe('POST /api/fixes/apply', () => {
  it('rejects with 400 when confirmed is not exactly true', async () => {
    const app = await buildApp();
    for (const payload of [
      { caches: ['npm-cache'], processes: [1234] },
      { caches: ['npm-cache'], processes: [1234], confirmed: false },
      { caches: ['npm-cache'], processes: [1234], confirmed: 'yes' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/fixes/apply',
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'consent required' });
    }
    expect(clearDirContents).not.toHaveBeenCalled();
    expect(killProcess).not.toHaveBeenCalled();
    await app.close();
  });

  it('clears confirmed caches and kills confirmed pids when confirmed is true', async () => {
    vi.mocked(getSafeCacheTargets).mockResolvedValue(CACHE_TARGETS);
    vi.mocked(clearDirContents).mockResolvedValue({ ok: true, freedBytes: 2048 });
    vi.mocked(killProcess).mockResolvedValue({ ok: true });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/fixes/apply',
      payload: {
        caches: ['npm-cache', 'user-caches'],
        processes: [1234, 5678],
        confirmed: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.freedBytes).toBe(4096);
    expect(body.killedPids).toEqual([1234, 5678]);
    expect(body.errors).toEqual([]);

    expect(clearDirContents).toHaveBeenCalledTimes(2);
    expect(clearDirContents).toHaveBeenCalledWith(CACHE_TARGETS[0].path);
    expect(clearDirContents).toHaveBeenCalledWith(CACHE_TARGETS[1].path);
    expect(killProcess).toHaveBeenCalledTimes(2);
    expect(killProcess).toHaveBeenCalledWith(1234);
    expect(killProcess).toHaveBeenCalledWith(5678);
    await app.close();
  });

  it('collects errors for unknown cache targets and failed kills', async () => {
    vi.mocked(getSafeCacheTargets).mockResolvedValue(CACHE_TARGETS);
    vi.mocked(clearDirContents).mockResolvedValue({ ok: false, freedBytes: 0, error: 'permission denied' });
    vi.mocked(killProcess).mockResolvedValue({ ok: false, error: 'kill failed' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/fixes/apply',
      payload: {
        caches: ['npm-cache', 'does-not-exist'],
        processes: [1234],
        confirmed: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.freedBytes).toBe(0);
    expect(body.killedPids).toEqual([]);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        'unknown cache target: does-not-exist',
        'permission denied',
        'kill failed',
      ]),
    );
    await app.close();
  });
});
