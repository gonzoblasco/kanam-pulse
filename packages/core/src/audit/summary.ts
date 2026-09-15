// src/audit/summary.ts
// "Explain this audit": optional human-language summary of a battery run via
// a local Ollama instance. Strictly privacy-preserving: the prompt carries
// only aggregate metrics. Everything degrades gracefully.

import os from 'node:os';
import type { BatteryResult } from '../core/runner.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = process.env.KANAM_PULSE_AI_MODEL || 'deepseek-v4-flash:cloud';

interface OllamaSummaryResult {
  ok: boolean;
  explanation?: string;
  error?: string;
}

function sanitizeText(text: string): string {
  if (typeof text !== 'string') return '';
  let out = text.replaceAll(os.homedir(), '').replaceAll('~', '');

  out = out
    .split(/\s+/)
    .filter((token) => {
      if (!token) return false;
      if (/^~/.test(token)) return false;
      if (token.startsWith('/') && token.split('/').length > 2) return false;
      if (token.includes('/Users/') || token.includes('/home/')) return false;
      return true;
    })
    .join(' ');

  out = out.replaceAll('/Users/', '').replaceAll('/home/', '');
  return out.trim();
}

export function buildAuditSummaryPrompt(battery: BatteryResult): string {
  const b = battery && typeof battery === 'object' ? battery : ({} as BatteryResult);
  const checks = Array.isArray(b.checks) ? b.checks : [];

  const lines: string[] = [];
  lines.push(
    'You are a system health analyst. Summarize the following system health check audit in clear, friendly, non-technical human language. Keep it concise and actionable.',
  );
  lines.push(
    'Use ONLY the aggregate metrics provided below. Do NOT invent, guess, or reference any file paths, directories, or personal data.',
  );
  lines.push('');
  lines.push('SYSTEM HEALTH AUDIT');
  lines.push(`Overall score: ${typeof b.overall === 'number' ? b.overall : 0}/100`);
  lines.push(`Status: ${b.status || 'unknown'}`);
  if (b.timestamp) lines.push(`Timestamp: ${b.timestamp}`);
  lines.push('');

  lines.push('Checks:');
  if (checks.length === 0) {
    lines.push('- (no check data)');
  } else {
    for (const check of checks) {
      const score = typeof check.score === 'number' ? check.score : 0;
      const status = check.status || 'unknown';
      const name = sanitizeText(check.name) || 'Unknown check';
      lines.push(`- ${name}: ${score}/100 (${status})`);
    }
  }

  lines.push('');
  lines.push('Suggestions (by check, priority, action):');
  let suggestionCount = 0;
  for (const check of checks) {
    const suggestions = Array.isArray(check.suggestions) ? check.suggestions : [];
    for (const suggestion of suggestions) {
      const priority = suggestion.priority || 'low';
      const action = sanitizeText(suggestion.action);
      if (!action) continue;
      suggestionCount += 1;
      lines.push(`- [${sanitizeText(check.id)}] (${priority}) ${action}`);
    }
  }
  if (suggestionCount === 0) {
    lines.push('- (no suggestions)');
  }

  lines.push('');
  lines.push(
    'Write a short, friendly summary of this audit in 2-4 sentences, highlighting what is healthy, what needs attention, and the top priority action. Do not mention paths or file names.',
  );

  return lines.join('\n');
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; timer: ReturnType<typeof setTimeout> } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, timer };
}

export async function isOllamaAvailable(baseUrl: string = DEFAULT_BASE_URL): Promise<boolean> {
  let response: Response;
  try {
    const { signal, timer } = withTimeout(2000);
    try {
      response = await fetch(`${baseUrl}/api/tags`, { signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) return false;
    const payload = (await response.json()) as { models?: unknown };
    return Array.isArray(payload?.models);
  } catch {
    return false;
  }
}

export async function explainAudit(
  battery: BatteryResult,
  {
    baseUrl = DEFAULT_BASE_URL,
    model = DEFAULT_MODEL,
    maxTokens = 300,
    timeoutMs = 30000,
  }: { baseUrl?: string; model?: string; maxTokens?: number; timeoutMs?: number } = {},
): Promise<OllamaSummaryResult> {
  if (!battery || typeof battery !== 'object') {
    return { ok: false, error: 'invalid battery' };
  }

  let response: Response;
  try {
    const prompt = buildAuditSummaryPrompt(battery);
    const { signal, timer } = withTimeout(timeoutMs);
    try {
      response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          think: false,
          options: { num_predict: maxTokens },
        }),
        signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return { ok: false, error: `ollama generate failed: HTTP ${response.status}` };
    }

    const payload = (await response.json()) as { response?: unknown };
    const explanation = typeof payload.response === 'string' ? payload.response.trim() : '';
    if (!explanation) return { ok: false, error: 'ollama returned an empty response' };
    return { ok: true, explanation };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const reason = e?.name === 'AbortError' ? 'timeout' : e?.message ? e.message : String(err);
    return { ok: false, error: `ollama unavailable: ${reason}` };
  }
}
