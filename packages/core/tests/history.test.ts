// tests/history.test.js

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendHistory,
  getHistoryPath,
  readHistory,
  summarizeTrend,
} from '../src/core/history.js';

// Redirect history to a temp dir so we never touch the real home.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shc-test-'));
vi.spyOn(os, 'homedir').mockReturnValue(TMP);

// A minimal battery result shape.
function makeBattery(overall, status, checks) {
  return {
    timestamp: new Date().toISOString(),
    overall,
    status,
    checks: checks.map(([id, score, st]) => ({ id, score, status: st })),
  };
}

describe('history', () => {
  beforeEach(() => {
    // Recreate the temp home dir and clean the history file between tests.
    fs.mkdirSync(TMP, { recursive: true });
    const file = path.join(TMP, '.system-health-check', 'history.json');
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  afterEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('readHistory returns empty array when no history exists', () => {
    expect(readHistory()).toEqual([]);
  });

  it('appendHistory persists an entry and readHistory returns it', () => {
    const battery = makeBattery(80, 'healthy', [['disk', 90, 'healthy']]);
    appendHistory(battery);
    const history = readHistory();
    expect(history).toHaveLength(1);
    expect(history[0].overall).toBe(80);
    expect(history[0].checks[0].id).toBe('disk');
  });

  it('appendHistory keeps only the most recent MAX_ENTRIES', () => {
    // Append 105 entries; only the last 100 should remain.
    for (let i = 0; i < 105; i++) {
      appendHistory(makeBattery(i % 100, 'healthy', []));
    }
    const history = readHistory();
    expect(history.length).toBeLessThanOrEqual(100);
    // The last appended should be the most recent.
    expect(history[history.length - 1].overall).toBe(104 % 100);
  });

  it('summarizeTrend returns none for empty history', () => {
    const t = summarizeTrend([]);
    expect(t.count).toBe(0);
    expect(t.direction).toBe('none');
  });

  it('summarizeTrend computes improving direction', () => {
    const history = [
      { overall: 60, status: 'attention', checks: [] },
      { overall: 80, status: 'healthy', checks: [] },
    ];
    const t = summarizeTrend(history);
    expect(t.latest).toBe(80);
    expect(t.previous).toBe(60);
    expect(t.delta).toBe(20);
    expect(t.direction).toBe('improving');
  });

  it('summarizeTrend computes declining direction', () => {
    const history = [
      { overall: 90, status: 'healthy', checks: [] },
      { overall: 50, status: 'attention', checks: [] },
    ];
    const t = summarizeTrend(history);
    expect(t.delta).toBe(-40);
    expect(t.direction).toBe('declining');
  });

  it('getHistoryPath points under the home dir', () => {
    expect(getHistoryPath()).toContain('.system-health-check');
  });
});
