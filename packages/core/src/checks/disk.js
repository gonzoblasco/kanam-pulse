// src/checks/disk.js
// Storage health check: disk usage %, biggest consumers, reclaimable caches.
// Returns 0-100 score and actionable suggestions.

import os from 'node:os';
import { runSafe } from '../core/exec.js';

/**
 * Probe disk usage for the root volume.
 * @returns {Promise<{totalBytes:number, freeBytes:number, usedBytes:number, usedPct:number}|null>}
 */
async function getDiskStats() {
  // df outputs 1K blocks by default; use -k for consistency.
  const res = await runSafe('df -k /');
  if (!res) return null;

  const line = res.stdout.split('\n')[1];
  if (!line) return null;

  const parts = line.split(/\s+/);
  if (parts.length < 5) return null;

  // macOS df columns: Filesystem 512-blocks Used Available Capacity iused ifree %iused Mounted on
  const totalKb = Number(parts[1]);
  const usedKb = Number(parts[2]);
  const freeKb = Number(parts[3]);
  const usedPct = Number(parts[4]?.replace('%', '')) || 0;

  if (Number.isNaN(totalKb) || Number.isNaN(usedKb) || Number.isNaN(freeKb))
    return null;

  return {
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    freeBytes: freeKb * 1024,
    usedPct,
  };
}

/**
 * Find the largest files under a directory (top N).
 * @param {string} dir
 * @param {number} [limit]
 * @returns {Promise<Array<{path:string,sizeBytes:number}>|null>}
 */
async function getLargestFiles(dir = os.homedir(), limit = 5) {
  // Find top-level dirs/files up to a depth to avoid a 10-minute scan.
  const res = await runSafe(
    `du -sm "${dir}"/* 2>/dev/null | sort -rn | head -${limit}`,
  );
  if (!res) return null;

  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sizeMb, ...rest] = line.split('\t');
      const p = rest.join('\t');
      return { path: p, sizeBytes: Number(sizeMb) * 1024 * 1024 };
    })
    .filter((f) => f.sizeBytes > 0);
}

/**
 * Estimate reclaimable cache size in well-known cache locations.
 * @returns {Promise<{caches:Array<{path:string,sizeBytes:number}>, totalBytes:number}|null>}
 */
async function getCacheUsage() {
  const home = os.homedir();
  const candidates = [
    `${home}/Library/Caches`,
    `${home}/Library/Developer/Caches`,
    '/private/var/folders', // user temp
  ];

  const results = [];
  let total = 0;
  for (const dir of candidates) {
    const res = await runSafe(`du -sh "${dir}" 2>/dev/null | awk '{print $1}'`);
    if (!res) continue;
    // du -sh gives human format; recompute numerically via -sk for bytes.
    const numRes = await runSafe(
      `du -sk "${dir}" 2>/dev/null | grep -oE '^[0-9]+'`,
    );
    if (!numRes) continue;
    const kb = Number(numRes.stdout.trim());
    if (Number.isNaN(kb) || kb <= 0) continue;
    const sizeBytes = kb * 1024;
    results.push({ path: dir, sizeBytes });
    total += sizeBytes;
  }

  return { caches: results, totalBytes: total };
}

/**
 * Run the disk health check.
 * Returns: { score, status, details, suggestions }
 */
export async function checkDisk() {
  const stats = await getDiskStats();
  const largest = await getLargestFiles(os.homedir(), 5);
  const caches = await getCacheUsage();

  if (!stats) {
    return {
      score: 0,
      status: 'error',
      details: { error: 'Could not read disk stats' },
      suggestions: [],
    };
  }

  const { usedPct } = stats;

  let score = 100;
  if (usedPct >= 90) score = 20;
  else if (usedPct >= 80) score = 50;
  else if (usedPct >= 70) score = 75;

  const suggestions = [];
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

  const details = { usedPct, ...stats };
  if (largest?.length) details.largestFiles = largest.slice(0, 3);
  if (caches) details.cacheTotalBytes = caches.totalBytes;

  return {
    score,
    status: score >= 70 ? 'healthy' : 'warning',
    details,
    suggestions,
  };
}
