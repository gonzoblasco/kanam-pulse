// src/core/history.ts
// Persist run history to a local JSON file so health can be tracked over time.
// Stores only the essential per-check scores + overall, not full details.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HISTORY_DIR = () => path.join(os.homedir(), '.system-health-check');
const HISTORY_FILE = () => path.join(HISTORY_DIR(), 'history.json');
const MAX_ENTRIES = 100;

export interface CheckEntry {
  id: string;
  score: number;
  status: string;
}

export interface BatterySummary {
  timestamp: string;
  overall: number;
  status: string;
  checks: CheckEntry[];
}

export interface TrendSummary {
  count: number;
  latest: number | null;
  previous: number | null;
  delta: number | null;
  direction: string;
}

/** Ensure the history directory exists. */
function ensureDir(): void {
  if (!fs.existsSync(HISTORY_DIR())) {
    fs.mkdirSync(HISTORY_DIR(), { recursive: true });
  }
}

/** Read the full history from disk. */
export function readHistory(): BatterySummary[] {
  try {
    if (!fs.existsSync(HISTORY_FILE())) return [];
    const raw = fs.readFileSync(HISTORY_FILE(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Append a run summary to history, keeping the most recent MAX_ENTRIES. */
export function appendHistory(battery: BatterySummary): BatterySummary[] {
  ensureDir();

  const entry: BatterySummary = {
    timestamp: battery.timestamp,
    overall: battery.overall,
    status: battery.status,
    checks: battery.checks.map((c) => ({
      id: c.id,
      score: c.score,
      status: c.status,
    })),
  };

  const history = readHistory();
  history.push(entry);
  const trimmed = history.slice(-MAX_ENTRIES);

  try {
    fs.writeFileSync(HISTORY_FILE(), JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch {
    // Non-fatal: history is best-effort.
  }

  return trimmed;
}

/** Compute a simple trend summary from history. */
export function summarizeTrend(history: BatterySummary[] = readHistory()): TrendSummary {
  if (history.length === 0) {
    return { count: 0, latest: null, previous: null, delta: null, direction: 'none' };
  }

  const latest = history[history.length - 1].overall;
  const previous = history.length >= 2 ? history[history.length - 2].overall : null;
  const delta = previous !== null ? latest - previous : null;

  let direction = 'none';
  if (delta !== null) {
    if (delta > 0) direction = 'improving';
    else if (delta < 0) direction = 'declining';
    else direction = 'stable';
  }

  return { count: history.length, latest, previous, delta, direction };
}

/** Get the path to the history file (for display/debug). */
export function getHistoryPath(): string {
  return HISTORY_FILE();
}
