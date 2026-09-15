// tests/cleaner.test.js

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  clearDirContents,
  getDirSizeBytes,
  getSafeCacheTargets,
  scanSafeCaches,
} from '../src/fix/cleaner.js';

// Mock os.homedir to a temp dir so we never touch the real home.
const FAKE_HOME = '/tmp/fake-home';
vi.spyOn(os, 'homedir').mockReturnValue(FAKE_HOME);

// Mock runSafe (used by getDirSizeBytes) to return a fixed size.
vi.mock('../src/core/exec.js', () => ({
  runSafe: vi.fn(async () => ({ stdout: '2048', stderr: '' })),
}));

// Mock the trash binary: callback-style mock because cleaner.js wraps
// execFile with util.promisify. Never touches the real Trash in tests.
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_bin, _args, _opts, cb) => {
    cb(null, { stdout: '', stderr: '' });
  }),
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
    expect(execFile).not.toHaveBeenCalled();
    existsSpy.mockRestore();
  });

  it('moves each entry to the trash and reports freed bytes', async () => {
    // existsSync true for both the dir and the trash binary check.
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readdirSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue(['a', 'b']);
    vi.mocked(execFile).mockClear();

    const result = await clearDirContents('/some/cache');
    expect(result.ok).toBe(true);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(execFile).toHaveBeenCalledTimes(2);
    expect(vi.mocked(execFile).mock.calls[0][0]).toBe('/usr/bin/trash');
    expect(vi.mocked(execFile).mock.calls[0][1]).toEqual(['/some/cache/a']);
    expect(vi.mocked(execFile).mock.calls[1][1]).toEqual(['/some/cache/b']);

    existsSpy.mockRestore();
    readdirSpy.mockRestore();
  });

  it('refuses to run when the trash binary is unavailable', async () => {
    // Dir checks pass, the trash binary check fails. Conditional impl is
    // robust to call order (existsSync is also used inside getDirSizeBytes).
    const existsSpy = vi
      .spyOn(fs, 'existsSync')
      .mockImplementation((p) => p !== '/usr/bin/trash');
    const readdirSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue(['a']);
    vi.mocked(execFile).mockClear();

    const result = await clearDirContents('/some/cache');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/trash-style removal unavailable/i);
    expect(execFile).not.toHaveBeenCalled();

    existsSpy.mockRestore();
    readdirSpy.mockRestore();
  });

  it('returns ok:false when trash fails', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readdirSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue(['a']);
    vi.mocked(execFile).mockImplementationOnce((_bin, _args, _opts, cb) => {
      cb(new Error('trash: operation failed'));
    });

    const result = await clearDirContents('/some/cache');
    expect(result.ok).toBe(false);
    expect(result.freedBytes).toBe(0);
    expect(result.error).toBe('trash: operation failed');

    existsSpy.mockRestore();
    readdirSpy.mockRestore();
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
