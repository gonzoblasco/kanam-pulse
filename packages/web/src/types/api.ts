// src/types/api.ts
// Shared API response types for the web dashboard. Mirrors the server
// routes (packages/server) and the @kanam-pulse/core engine shapes.

export interface HealthCheckResult {
  id: string;
  name: string;
  score: number;
  status: string;
  suggestions?: Array<{ priority: string; action: string }>;
}

export interface HealthRunData {
  overall: number;
  status: 'healthy' | 'attention' | 'degraded';
  timestamp?: string;
  checks?: HealthCheckResult[];
  runInfo: {
    elapsedMs: number;
    total: number;
    passed: number;
    warnings: number;
    errors: number;
  };
}

export interface CacheTarget {
  id: string;
  label: string;
  path: string;
  description: string;
  sizeBytes: number;
}

export interface HeavyProcess {
  pid: number;
  command: string;
  cpuPct: number;
  memPct: number;
}

export interface FixScanResult {
  caches: CacheTarget[];
  processes: HeavyProcess[];
}

export interface FixDryRunResult {
  wouldFreeBytes: number;
  caches: CacheTarget[];
  processes: HeavyProcess[];
}

export interface ExplainAuditResponse {
  available: boolean;
  explanation?: string;
  error?: string;
}

export interface FixApplyResult {
  freedBytes: number;
  killedPids: number[];
  errors: string[];
}
