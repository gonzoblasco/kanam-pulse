// src/audit/summary.js
// "Explain this audit": optional human-language summary of a battery run via
// a local Ollama instance. Strictly privacy-preserving: the prompt carries
// only aggregate metrics (overall score, status, per-check scores and
// suggestion action text) - never user file paths, file contents, or
// personal data. Everything degrades gracefully: if Ollama is not running,
// the feature reports unavailable instead of throwing.

import os from 'node:os';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3.5:9b-mlx';

/**
 * Strip path-like content (absolute paths, home-dir references) from a text
 * fragment so no user file paths leak into a prompt.
 * @param {string} text
 * @returns {string}
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  let out = text.replaceAll(os.homedir(), '').replaceAll('~', '');

  out = out
    .split(/\s+/)
    .filter((token) => {
      if (!token) return false;
      // Tilde references (home) are personal context - drop them.
      if (/^~/.test(token)) return false;
      // Absolute paths with 2+ segments: drop the whole token.
      if (token.startsWith('/') && token.split('/').length > 2) return false;
      // Any lingering /Users/ or /home/ markers: drop.
      if (token.includes('/Users/') || token.includes('/home/')) return false;
      return true;
    })
    .join(' ');

  // Belt-and-suspenders: never let the markers appear at all.
  out = out.replaceAll('/Users/', '').replaceAll('/home/', '');
  return out.trim();
}

/**
 * Build a summary-only prompt from a battery result.
 *
 * PRIVACY CONTRACT: the prompt contains aggregate metrics only:
 * - overall score + status
 * - per-check id, name, score and status (never `details`)
 * - suggestion action text, sanitized to drop any path-like content
 * No file paths, file contents or personal data are ever included.
 *
 * @param {object} battery - result of runBattery()
 * @returns {string}
 */
export function buildAuditSummaryPrompt(battery) {
  const b = battery && typeof battery === 'object' ? battery : {};
  const checks = Array.isArray(b.checks) ? b.checks : [];

  const lines = [];
  lines.push('You are a system health analyst. Summarize the following system health check audit in clear, friendly, non-technical human language. Keep it concise and actionable.');
  lines.push('Use ONLY the aggregate metrics provided below. Do NOT invent, guess, or reference any file paths, directories, or personal data.');
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
  lines.push('Write a short, friendly summary of this audit in 2-4 sentences, highlighting what is healthy, what needs attention, and the top priority action. Do not mention paths or file names.');

  return lines.join('\n');
}

/**
 * Build a fetch with an AbortController timeout.
 * @param {number} timeoutMs
 * @returns {{signal: AbortSignal, timer: ReturnType<typeof setTimeout>}}
 */
function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, timer };
}

/**
 * Check whether a local Ollama instance is up.
 * @param {string} [baseUrl]
 * @returns {Promise<boolean>} true when /api/tags answers 200 with a models array.
 */
export async function isOllamaAvailable(baseUrl = DEFAULT_BASE_URL) {
  let response;
  try {
    const { signal, timer } = withTimeout(2000);
    try {
      response = await fetch(`${baseUrl}/api/tags`, { signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return false;
    const payload = await response.json();
    return Array.isArray(payload && payload.models);
  } catch {
    // Network failure, timeout, bad JSON, or anything else: treat as unavailable.
    return false;
  }
}

/**
 * Summarize a battery run in human language via local Ollama.
 *
 * Never throws: always resolves to { ok: true, explanation } or
 * { ok: false, error }.
 *
 * @param {object} battery - result of runBattery()
 * @param {object} [options]
 * @param {string} [options.baseUrl='http://localhost:11434']
 * @param {string} [options.model='qwen3.5:9b-mlx']
 * @param {number} [options.maxTokens=300]
 * @param {number} [options.timeoutMs=30000] - generation can take a while.
 * @returns {Promise<{ok:boolean, explanation?:string, error?:string}>}
 */
export async function explainAudit(
  battery,
  { baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL, maxTokens = 300, timeoutMs = 30000 } = {},
) {
  if (!battery || typeof battery !== 'object') {
    return { ok: false, error: 'invalid battery' };
  }

  let response;
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

    const payload = await response.json();
    const explanation = typeof payload.response === 'string' ? payload.response.trim() : '';
    if (!explanation) {
      return { ok: false, error: 'ollama returned an empty response' };
    }
    return { ok: true, explanation };
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timeout' : err && err.message ? err.message : String(err);
    return { ok: false, error: `ollama unavailable: ${reason}` };
  }
}
