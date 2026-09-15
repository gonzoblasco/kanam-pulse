// src/fix/cleaner.ts
// Safe cleanup actions for the --fix mode.
// ONLY touches well-known cache/temp locations that are safe to delete.
// Never touches user data, documents, or anything ambiguous.
// Every action requires explicit confirmation before running.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { runSafe } from '../core/exec.js';

const execFileAsync = promisify(execFile);

const TRASH_BIN = '/usr/bin/trash';
const TRASH_TIMEOUT = 10000;

export interface CacheTarget {
  id: string;
  label: string;
  path: string;
  description: string;
}

export interface ScanResult extends CacheTarget {
  sizeBytes: number;
}

export interface CleanResult {
  ok: boolean;
  freedBytes: number;
  error?: string;
}

/** Well-known safe-to-clean cache locations. */
export function getSafeCacheTargets(): CacheTarget[] {
  const home = os.homedir();
  return [
    { id: 'user-caches', label: 'User app caches', path: `${home}/Library/Caches`, description: 'App caches (regenerable, no user data lost)' },
    { id: 'dev-caches', label: 'Developer caches', path: `${home}/Library/Developer/Caches`, description: 'Xcode/developer caches (regenerable)' },
    { id: 'npm-cache', label: 'npm cache', path: `${home}/.npm/_cacache`, description: 'npm package cache (safe to clear, re-downloads on demand)' },
    { id: 'yarn-cache', label: 'Yarn cache', path: `${home}/Library/Caches/Yarn`, description: 'Yarn package cache (safe to clear)' },
  ];
}

/** Compute the size of a directory in bytes. */
export async function getDirSizeBytes(dir: string): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  const res = await runSafe(`du -sk "${dir}" 2>/dev/null | grep -oE '^[0-9]+'`);
  if (!res) return 0;
  const kb = Number(res.stdout.trim());
  return Number.isFinite(kb) && kb > 0 ? kb * 1024 : 0;
}

/** Delete a directory's contents (not the dir itself) safely. */
export async function clearDirContents(dir: string): Promise<CleanResult> {
  if (!fs.existsSync(dir)) return { ok: true, freedBytes: 0 };

  const before = await getDirSizeBytes(dir);
  if (!fs.existsSync(TRASH_BIN)) {
    return { ok: false, freedBytes: 0, error: 'trash-style removal unavailable; refusing permanent delete' };
  }
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      await execFileAsync(TRASH_BIN, [full], { timeout: TRASH_TIMEOUT });
    }
    return { ok: true, freedBytes: before };
  } catch (err) {
    const e = err as Error;
    return { ok: false, freedBytes: 0, error: e.message };
  }
}

/** Scan all safe cache targets and report which are worth cleaning. */
export async function scanSafeCaches(): Promise<ScanResult[]> {
  const targets = getSafeCacheTargets();
  const results: ScanResult[] = [];
  for (const t of targets) {
    const sizeBytes = await getDirSizeBytes(t.path);
    if (sizeBytes > 0) results.push({ ...t, sizeBytes });
  }
  return results;
}
