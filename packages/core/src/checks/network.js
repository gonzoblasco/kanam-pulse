// src/checks/network.js
// Network health check: connectivity, DNS resolution, latency.
// Uses only safe, non-destructive probes.

import { runSafe } from '../core/exec.js';

// Well-known reliable endpoints for latency probes.
const PING_TARGETS = [
  { host: '1.1.1.1', label: 'Cloudflare DNS' },
  { host: '8.8.8.8', label: 'Google DNS' },
];

// DNS resolution targets (fast, reliable).
const DNS_TARGETS = ['google.com', 'cloudflare.com'];

/**
 * Probe latency to a host with a single ping (macOS: -c 1 -t 3).
 * @param {string} host
 * @returns {Promise<number|null>} latency in ms, or null if unreachable
 */
async function pingLatency(host) {
  const res = await runSafe(`ping -c 1 -t 3 "${host}" 2>/dev/null`);
  if (!res) return null;
  // macOS ping output: "round-trip min/avg/max/stddev = 12.345/..."
  const match = res.stdout.match(/round-trip.*=\s*([\d.]+)\//);
  if (match) return Number(match[1]);
  // Fallback: "time=12.3 ms"
  const timeMatch = res.stdout.match(/time=([\d.]+)\s*ms/);
  return timeMatch ? Number(timeMatch[1]) : null;
}

/**
 * Check DNS resolution for a host.
 * @param {string} host
 * @returns {Promise<{ok:boolean, ip?:string}|null>}
 */
async function resolveDns(host) {
  const res = await runSafe(
    `dscacheutil -q host -a name "${host}" 2>/dev/null`,
  );
  if (!res) return null;
  const ipMatch = res.stdout.match(/ip_address:\s*([\d.]+)/);
  return { ok: Boolean(ipMatch), ip: ipMatch?.[1] };
}

/**
 * Check basic internet connectivity (can we reach a known host).
 * @returns {Promise<boolean|null>}
 */
async function hasConnectivity() {
  const res = await runSafe(
    'curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://www.google.com 2>/dev/null',
  );
  if (!res) return null;
  const code = Number(res.stdout.trim());
  return code >= 200 && code < 500;
}

/**
 * Run the network health check.
 */
export async function checkNetwork() {
  const connectivity = await hasConnectivity();
  const latencies = [];
  for (const t of PING_TARGETS) {
    const ms = await pingLatency(t.host);
    latencies.push({ host: t.host, label: t.label, latencyMs: ms });
  }

  const dnsResults = [];
  for (const host of DNS_TARGETS) {
    const r = await resolveDns(host);
    dnsResults.push({ host, ok: r?.ok ?? false, ip: r?.ip });
  }

  const reachablePings = latencies.filter((l) => l.latencyMs !== null);
  const avgLatency = reachablePings.length
    ? reachablePings.reduce((s, l) => s + l.latencyMs, 0) /
      reachablePings.length
    : null;

  const dnsOk = dnsResults.filter((d) => d.ok).length;

  let score = 100;
  const suggestions = [];

  if (connectivity === false) {
    score = 0;
    suggestions.push({
      priority: 'high',
      component: 'network',
      action:
        'No internet connectivity detected. Check Wi-Fi/ethernet and router.',
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
      action:
        'DNS resolution failing for some hosts. Check DNS settings or try 1.1.1.1 / 8.8.8.8.',
      impact: 'Fixes "can\'t resolve host" errors.',
    });
  }

  return {
    score,
    status: score >= 70 ? 'healthy' : score === 0 ? 'critical' : 'warning',
    details: {
      connectivity,
      avgLatencyMs: avgLatency,
      latencies,
      dns: dnsResults,
    },
    suggestions,
  };
}
