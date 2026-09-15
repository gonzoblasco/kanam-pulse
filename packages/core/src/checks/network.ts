// src/checks/network.ts
// Network health check: connectivity, DNS resolution, latency.
// Uses only safe, non-destructive probes.

import { runSafe } from '../core/exec.js';
import type { CheckRunResult, CheckSuggestion } from './index.js';

interface PingTarget {
  host: string;
  label: string;
}

interface DnsResult {
  ok: boolean;
  ip?: string;
}

const PING_TARGETS: PingTarget[] = [
  { host: '1.1.1.1', label: 'Cloudflare DNS' },
  { host: '8.8.8.8', label: 'Google DNS' },
];

const DNS_TARGETS = ['google.com', 'cloudflare.com'];

async function pingLatency(host: string): Promise<number | null> {
  const res = await runSafe(`ping -c 1 -t 3 "${host}" 2>/dev/null`);
  if (!res) return null;
  const match = res.stdout.match(/round-trip.*=\s*([\d.]+)\//);
  if (match) return Number(match[1]);
  const timeMatch = res.stdout.match(/time=([\d.]+)\s*ms/);
  return timeMatch ? Number(timeMatch[1]) : null;
}

async function resolveDns(host: string): Promise<DnsResult | null> {
  const res = await runSafe(`dscacheutil -q host -a name "${host}" 2>/dev/null`);
  if (!res) return null;
  const ipMatch = res.stdout.match(/ip_address:\s*([\d.]+)/);
  return { ok: Boolean(ipMatch), ip: ipMatch?.[1] };
}

async function hasConnectivity(): Promise<boolean | null> {
  const res = await runSafe(
    'curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://www.google.com 2>/dev/null',
  );
  if (!res) return null;
  const code = Number(res.stdout.trim());
  return code >= 200 && code < 500;
}

export async function checkNetwork(): Promise<CheckRunResult> {
  const connectivity = await hasConnectivity();
  const latencies: Array<{ host: string; label: string; latencyMs: number | null }> = [];
  for (const t of PING_TARGETS) {
    const ms = await pingLatency(t.host);
    latencies.push({ host: t.host, label: t.label, latencyMs: ms });
  }

  const dnsResults: Array<{ host: string; ok: boolean; ip?: string }> = [];
  for (const host of DNS_TARGETS) {
    const r = await resolveDns(host);
    dnsResults.push({ host, ok: r?.ok ?? false, ip: r?.ip });
  }

  const reachablePings = latencies.filter((l) => l.latencyMs !== null);
  const avgLatency = reachablePings.length
    ? reachablePings.reduce((s, l) => s + (l.latencyMs as number), 0) / reachablePings.length
    : null;

  const dnsOk = dnsResults.filter((d) => d.ok).length;

  let score = 100;
  const suggestions: CheckSuggestion[] = [];

  if (connectivity === false) {
    score = 0;
    suggestions.push({
      priority: 'high',
      component: 'network',
      action: 'No internet connectivity detected. Check Wi-Fi/ethernet and router.',
      impact: 'Restores all network-dependent functionality.',
    });
  } else if (connectivity === null) {
    score = 30;
    suggestions.push({
      priority: 'medium',
      component: 'network',
      action: 'Could not verify internet connectivity.',
      impact: 'Network may be partially degraded.',
    });
  }

  if (avgLatency !== null && avgLatency > 150) {
    score = Math.min(score, 50);
    suggestions.push({
      priority: 'medium',
      component: 'network',
      action: `High latency (${Math.round(avgLatency)} ms avg). Consider a closer server or wired connection.`,
      impact: 'Lower latency improves responsiveness of network apps.',
    });
  }

  if (dnsOk < DNS_TARGETS.length) {
    score = Math.min(score, 40);
    suggestions.push({
      priority: 'high',
      component: 'network',
      action: 'DNS resolution failing for some hosts. Check DNS settings or try 1.1.1.1 / 8.8.8.8.',
      impact: 'Fixes "can\'t resolve host" errors.',
    });
  }

  return {
    score,
    status: score >= 70 ? 'healthy' : score === 0 ? 'critical' : 'warning',
    details: { connectivity, avgLatencyMs: avgLatency, latencies, dns: dnsResults },
    suggestions,
  };
}
