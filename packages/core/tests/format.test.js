// tests/format.test.js
import { describe, expect, it } from 'vitest';
import { formatBytes, scoreStatus, statusLabel } from '../src/utils/format.js';

describe('formatBytes', () => {
  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('handles bytes without units', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('converts KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('converts MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('converts GB', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('uses whole numbers for large values', () => {
    expect(formatBytes(150 * 1024 ** 3)).toBe('150 GB');
  });

  it('rejects negative/NaN input', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('scoreStatus', () => {
  it('returns healthy for >= 85', () => {
    expect(scoreStatus(90)).toBe('healthy');
  });

  it('returns good for 70-84', () => {
    expect(scoreStatus(75)).toBe('good');
  });

  it('returns attention for 40-69', () => {
    expect(scoreStatus(50)).toBe('attention');
  });

  it('returns critical for < 40', () => {
    expect(scoreStatus(20)).toBe('critical');
  });
});

describe('statusLabel', () => {
  it('uppercases known statuses', () => {
    expect(statusLabel('healthy')).toBe('HEALTHY');
    expect(statusLabel('attention')).toBe('ATTENTION');
    expect(statusLabel('critical')).toBe('CRITICAL');
  });

  it('falls back to uppercase of unknown', () => {
    expect(statusLabel('nope')).toBe('NOPE');
  });
});
