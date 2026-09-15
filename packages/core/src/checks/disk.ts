// src/checks/disk.ts
// Storage health check: disk usage %, biggest consumers, reclaimable caches.

import os from 'node:os';
import { runSafe } from '../core/exec.js';
import type { CheckRunResult, CheckSuggestion } from './index.js';

interface DiskStats {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;
}

interface FileSize {
  path: string;
  sizeBytes: number;
}

async function getDiskStats(): Promise<DiskStats | null> {
  const res = await runSafe('df -k /');
  if (!res) return null;

  const line = res.stdout.split('\n')[1];
  if (!line) return null;

  const parts = line.split(/\s+/);
  if (parts.length < 5) return null;

  const totalKb = Number(parts[1]);
  const usedKb = Number(parts[2]);
  const freeKb = Number(parts[3]);
  const usedPct = Number(parts[4]?.replace('%', '')) || 0;

  if (Number.isNaN(totalKb) || Number.isNaN(usedKb) || Number.isNaN(freeKb)) return null;

  return {
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    freeBytes: freeKb * 1024,
    usedPct,
  };
}

async function getLargestFiles(dir: string = os.homedir(), limit = 5): Promise<FileSize[] | null> {
  const res = await runSafe(`du -sm "${dir}"/* 2>/dev/null | sort -rn | head -${limit}`);
  if (!res) return null;

  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line): FileSize => {
      const [sizeMb, ...rest] = line.split('\t');
      return { path: rest.join('\t'), sizeBytes: Number(sizeMb) * 1024 * 1024 };
    })
    .filter((f) => f.sizeBytes > 0);
}

interface CacheInfo {
  caches: FileSize[];
  totalBytes: number;
}

async function getCacheUsage(): Promise<CacheInfo | null> {
  const home = os.homedir();
  const candidates = [`${home}/Library/Caches`, `${home}/Library/Developer/Caches`, '/private/var/folders'];

  const results: FileSize[] = [];
  let total = 0;
  for (const dir of candidates) {
    const res = await runSafe(`du -sk "${dir}" 2>/dev/null | grep -oE '^[0-9]+'`);
    if (!res) continue;
    const kb = Number(res.stdout.trim());
    if (Number.isNaN(kb) || kb <= 0) continue;
    const sizeBytes = kb * 1024;
    results.push({ path: dir, sizeBytes });
    total += sizeBytes;
  }

  return { caches: results, totalBytes: total };
}

export async function checkDisk(): Promise<CheckRunResult> {
  const stats = await getDiskStats();
  const largest = await getLargestFiles(os.homedir(), 5);
  const caches = await getCacheUsage();

  if (!stats) {
    return { score: 0, status: 'error', details: { error: 'Could not read disk stats' }, suggestions: [] };
  }

  const { usedPct } = stats;

  let score = 100;
  if (usedPct >= 90) score = 20;
  else if (usedPct >= 80) score = 50;
  else if (usedPct >= 70) score = 75;

  const suggestions: CheckSuggestion[] = [];
  if (usedPct >= 70) {
    suggestions.push({
      priority: usedPct >= 90 ? 'high' : 'medium',
      component: 'disk',
      action: `Disk is ${usedPct}% full. Free up space by removing large unused files.`,
      impact: 'Frees storage and improves system responsiveness.',
    });
  }

  if (caches && caches.totalBytes > 500 * 1024 * 1024) {
    suggestions.push({
      priority: 'medium',
      component: 'disk',
      action: `~${Math.round(caches.totalBytes / (1024 * 1024 * 1024))} GB of caches found. Consider clearing app caches.`,
      impact: 'Frees several GB without losing user data.',
    });
  }

  const details: Record<string, unknown> = { ...stats };
  if (largest?.length) details.largestFiles = largest.slice(0, 3);
  if (caches) details.cacheTotalBytes = caches.totalBytes;

  return { score, status: score >= 70 ? 'healthy' : 'warning', details, suggestions };
}
