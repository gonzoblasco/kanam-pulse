// tests/cleaner.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import { getSafeCacheTargets, getDirSizeBytes, clearDirContents, scanSafeCaches } from '../src/fix/cleaner.js';

// Mock os.homedir to a temp dir so we never touch the real home.
const FAKE_HOME = '/tmp/fake-home';
vi.spyOn(os, 'homedir').mockReturnValue(FAKE_HOME);

// Mock runSafe (used by getDirSizeBytes) to return a fixed size.
vi.mock('../src/core/exec.js', () => ({
  runSafe: vi.fn(async () => ({ stdout: '2048', stderr: '' })),
}));

describe('getSafeCacheTargets', () => {
  it('returns well-known safe cache locations under home', () => {
    const targets = getSafeCacheTargets();
    expect(targets.length).toBeGreaterThanOrEqual(4);
    expect(targets[0].path).toBe(`${FAKE_HOME}/Library/Caches`);
    for (const t of targets) {
      expect(t.path).toMatch(/Cache|cacache|Yarn/i);
    }
  });

  it('every target has an id, label, path and description', () => {
    for (const t of getSafeCacheTargets()) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.path).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });
});

describe('getDirSizeBytes', () => {
  it('returns 0 for a missing directory', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
    const size = await getDirSizeBytes('/nonexistent');
    expect(size).toBe(0);
    existsSpy.mockRestore();
  });

  it('returns bytes from runSafe output', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const size = await getDirSizeBytes('/some/cache');
    expect(size).toBe(2048 * 1024);
    existsSpy.mockRestore();
  });
});

describe('clearDirContents', () => {
  it('returns ok with 0 freed for a missing dir', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
    const result = await clearDirContents('/nonexistent');
    expect(result.ok).toBe(true);
    expect(result.freedBytes).toBe(0);
    existsSpy.mockRestore();
  });

  it('removes contents and reports freed bytes', async () => {
    // existsSync true, readdirSync returns entries, rmSync is a no-op spy.
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readdirSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue(['a', 'b']);
    const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

    const result = await clearDirContents('/some/cache');
    expect(result.ok).toBe(true);
    expect(rmSpy).toHaveBeenCalledTimes(2);
    expect(result.freedBytes).toBeGreaterThan(0);

    existsSpy.mockRestore();
    readdirSpy.mockRestore();
    rmSpy.mockRestore();
  });
});

describe('scanSafeCaches', () => {
  it('returns only targets with size > 0', async () => {
    const results = await scanSafeCaches();
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(r.sizeBytes).toBeGreaterThan(0);
    }
  });
});
