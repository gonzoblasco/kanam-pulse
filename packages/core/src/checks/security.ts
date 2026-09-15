// src/checks/security.ts
// Basic security health check: system updates pending, launch agents,
// and whether firewall is enabled.

import os from 'node:os';
import { runSafe } from '../core/exec.js';
import type { CheckRunResult, CheckSuggestion } from './index.js';

async function getFirewallStatus(): Promise<{ enabled: boolean; error?: string } | null> {
  const res = await runSafe(
    '/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate',
  );
  if (!res) return null;
  const stateMatch = res.stdout.match(/State = (\d)/);
  return { enabled: stateMatch?.[1] === '1' };
}

async function countLaunchAgents(): Promise<number | null> {
  const home = os.homedir();
  const dirs = [`${home}/Library/LaunchAgents`, '/Library/LaunchAgents'];
  let count = 0;
  for (const dir of dirs) {
    const res = await runSafe(`ls "${dir}" 2>/dev/null | wc -l`);
    if (res) {
      const n = Number(res.stdout.trim());
      if (Number.isFinite(n)) count += n;
    }
  }
  return count;
}

export async function checkSecurity(): Promise<CheckRunResult> {
  const firewall = await getFirewallStatus();
  const launchAgents = await countLaunchAgents();

  let score = 100;
  const suggestions: CheckSuggestion[] = [];

  if (firewall && !firewall.enabled) {
    score -= 40;
    suggestions.push({
      priority: 'high',
      component: 'security',
      action: 'macOS firewall is disabled. Enable it in System Settings > Network > Firewall.',
      impact: 'Blocks unwanted incoming network connections.',
    });
  }

  if (launchAgents && launchAgents > 15) {
    score -= 15;
    suggestions.push({
      priority: 'low',
      component: 'security',
      action: `${launchAgents} launch agents found. Review auto-start apps to reduce attack surface and boot time.`,
      impact: 'Fewer auto-start items means faster boot and less background activity.',
    });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    status: score >= 70 ? 'healthy' : 'warning',
    details: { firewall: firewall ? firewall.enabled : 'unknown', launchAgents: launchAgents ?? 'unknown' },
    suggestions,
  };
}
