// src/fix/cleaner.js
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

// Trash-style removal (SPEC: destructive operations go to the Trash, never
// immediate permanent delete). macOS ships /usr/bin/trash; if it is not
// available the engine refuses to clean rather than falling back to a
// permanent delete.
const TRASH_BIN = '/usr/bin/trash';
const TRASH_TIMEOUT = 10000;

/**
 * Well-known safe-to-clean cache locations.
 * Each entry: { id, label, path, description }
 * These are regenerable caches - deleting them loses no user data.
 */
export function getSafeCacheTargets() {
  const home = os.homedir();
  return [
    {
      id: 'user-caches',
      label: 'User app caches',
      path: `${home}/Library/Caches`,
      description: 'App caches (regenerable, no user data lost)',
    },
    {
      id: 'dev-caches',
      label: 'Developer caches',
      path: `${home}/Library/Developer/Caches`,
      description: 'Xcode/developer caches (regenerable)',
    },
    {
      id: 'npm-cache',
      label: 'npm cache',
      path: `${home}/.npm/_cacache`,
      description: 'npm package cache (safe to clear, re-downloads on demand)',
    },
    {
      id: 'yarn-cache',
      label: 'Yarn cache',
      path: `${home}/Library/Caches/Yarn`,
      description: 'Yarn package cache (safe to clear)',
    },
  ];
}

/**
 * Compute the size of a directory in bytes.
 * @param {string} dir
 * @returns {Promise<number>} 0 if missing/unreadable
 */
export async function getDirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  const res = await runSafe(`du -sk "${dir}" 2>/dev/null | grep -oE '^[0-9]+'`);
  if (!res) return 0;
  const kb = Number(res.stdout.trim());
  return Number.isFinite(kb) && kb > 0 ? kb * 1024 : 0;
}

/**
 * Delete a directory's contents (not the dir itself) safely.
 * Only called after the caller has confirmed.
 * @param {string} dir
 * @returns {Promise<{ok:boolean, freedBytes:number, error?:string}>}
 */
export async function clearDirContents(dir) {
  if (!fs.existsSync(dir)) {
    return { ok: true, freedBytes: 0 };
  }

  const before = await getDirSizeBytes(dir);
  if (!fs.existsSync(TRASH_BIN)) {
    return {
      ok: false,
      freedBytes: 0,
      error: 'trash-style removal unavailable; refusing permanent delete',
    };
  }
  try {
    // Move each entry to the Trash, keep the top-level dir.
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      await execFileAsync(TRASH_BIN, [full], { timeout: TRASH_TIMEOUT });
    }
    return { ok: true, freedBytes: before };
  } catch (err) {
    return { ok: false, freedBytes: 0, error: err.message };
  }
}

/**
 * Scan all safe cache targets and report which are worth cleaning.
 * @returns {Promise<Array<{id:string,label:string,path:string,description:string,sizeBytes:number}>>}
 */
export async function scanSafeCaches() {
  const targets = getSafeCacheTargets();
  const results = [];
  for (const t of targets) {
    const sizeBytes = await getDirSizeBytes(t.path);
    if (sizeBytes > 0) {
      results.push({ ...t, sizeBytes });
    }
  }
  return results;
}
