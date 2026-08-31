// src/app.js
// Local read-only HTTP API wrapping @kanam-pulse/core.
// GET-only surface; the core engine is the single source of truth.

import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import os from 'node:os';
import Fastify from 'fastify';
import {
  CHECKS,
  runBattery,
  readHistory,
  getSafeCacheTargets,
  scanSafeCaches,
  getDirSizeBytes,
  clearDirContents,
  scanHeavyProcesses,
  killProcess,
  isOllamaAvailable,
  explainAudit,
} from '@kanam-pulse/core';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Lightweight metrics for the SSE stream.
 * Memory: anonymous pages minus purgeable pages, from vm_stat (macOS).
 * Load: 1-minute average from os.loadavg().
 */
function collectMetrics() {
  return new Promise((resolve) => {
    execFile('vm_stat', (err, stdout) => {
      const load = os.loadavg()[0];
      if (err) {
        resolve({ memory: null, load, unit: 'bytes' });
        return;
      }
      const pageSize = Number(/page size of (\d+) bytes/.exec(stdout)?.[1]);
      const anon = Number(/Anonymous pages:\s+(\d+)\./.exec(stdout)?.[1]);
      const purgeable = Number(/Pages purgeable:\s+(\d+)\./.exec(stdout)?.[1]);
      const memory =
        Number.isFinite(pageSize) && Number.isFinite(anon)
          ? (anon - (Number.isFinite(purgeable) ? purgeable : 0)) * pageSize
          : null;
      resolve({ memory, load, unit: 'bytes' });
    });
  });
}

/**
 * Build the Fastify instance with all routes registered.
 * Intended for fastify.inject() in tests, or listen() via src/index.js.
 */
export async function buildApp() {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({
    ok: true,
    version: pkg.version,
  }));

  app.get('/api/checks', async () => ({
    checks: CHECKS.map(({ id, name }) => ({ id, name })),
  }));

  app.get('/api/run', async (request, reply) => {
    const raw = request.query?.checks;
    const checkIds = raw ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : [];
    const unknown = checkIds.filter((id) => !CHECKS.some((c) => c.id === id));
    if (unknown.length > 0) {
      reply.code(400);
      return { error: `unknown checks: ${unknown.join(', ')}` };
    }
    const report = await runBattery(checkIds);
    reply.header('cache-control', 'no-store');
    return report;
  });

  app.get('/api/history', async () => {
    const history = readHistory();
    return { history };
  });

  // ---- Explain this audit (optional local Ollama summary) ----
  // If a local Ollama instance is running, summarize a battery run in human
  // language. When it is not available the feature reports `available: false`
  // so the UI can hide it - this endpoint never breaks the audit flow.
  app.post('/api/audit/explain', async (request) => {
    const body = request.body ?? {};
    const battery = body && typeof body.battery === 'object' && body.battery ? body.battery : null;

    if (!(await isOllamaAvailable())) {
      return { available: false, error: 'ollama not available' };
    }

    // Prefer a battery supplied by the client; otherwise run a fresh one.
    const target = battery ?? (await runBattery());
    const result = await explainAudit(target);
    if (!result.ok) {
      return { available: true, error: result.error };
    }
    return { available: true, explanation: result.explanation };
  });

  // ---- Fixes with consent ----
  // Read-only scan: nothing is executed here, only reported.
  app.get('/api/fixes/scan', async () => {
    const [caches, processes] = await Promise.all([
      scanSafeCaches(),
      scanHeavyProcesses(20),
    ]);
    return { caches, processes };
  });

  // Dry-run: estimates what a given set of targets would free/kill.
  // Never executes a cleanup or kill; purely reports.
  app.post('/api/fixes/dry-run', async (request) => {
    const rawTargets = Array.isArray(request.body?.targets) ? request.body.targets : [];
    const cacheTargets = await getSafeCacheTargets();
    const byId = new Map(cacheTargets.map((t) => [t.id, t]));

    const caches = [];
    const processPids = [];
    let wouldFreeBytes = 0;

    for (const entry of rawTargets) {
      const target = String(entry);
      const cache = byId.get(target);
      if (cache) {
        const sizeBytes = await getDirSizeBytes(cache.path);
        caches.push({ ...cache, sizeBytes });
        wouldFreeBytes += sizeBytes;
        continue;
      }
      const pid = Number(target);
      if (Number.isInteger(pid) && pid > 0) {
        processPids.push(pid);
      }
    }

    // Only report processes from a current scan; never touch anything.
    const heavy = await scanHeavyProcesses(20);
    const byPid = new Map(heavy.map((p) => [p.pid, p]));
    const processes = processPids
      .filter((pid) => byPid.has(pid))
      .map((pid) => byPid.get(pid));

    return { wouldFreeBytes, caches, processes };
  });

  // Apply: destructive actions gated behind explicit confirmation.
  app.post('/api/fixes/apply', async (request, reply) => {
    const body = request.body ?? {};
    if (body.confirmed !== true) {
      reply.code(400);
      return { error: 'consent required' };
    }

    const cacheIds = Array.isArray(body.caches) ? body.caches.map(String) : [];
    const pids = Array.isArray(body.processes)
      ? body.processes.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    const cacheTargets = await getSafeCacheTargets();
    const byId = new Map(cacheTargets.map((t) => [t.id, t]));

    const errors = [];
    let freedBytes = 0;
    const killedPids = [];

    for (const id of cacheIds) {
      const target = byId.get(id);
      if (!target) {
        errors.push(`unknown cache target: ${id}`);
        continue;
      }
      try {
        const res = await clearDirContents(target.path);
        if (res && res.ok) {
          freedBytes += res.freedBytes ?? 0;
        } else {
          errors.push(res?.error || `failed to clear cache: ${id}`);
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    for (const pid of pids) {
      try {
        const res = await killProcess(pid);
        if (res && res.ok) {
          killedPids.push(pid);
        } else {
          errors.push(res?.error || `failed to kill process: ${pid}`);
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    return { freedBytes, killedPids, errors };
  });

  app.get('/api/metrics/stream', async (request, reply) => {
    // Take over the raw response so Fastify doesn't try to serialize.
    const { raw } = reply.hijack();
    raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    raw.setHeader('cache-control', 'no-cache');
    raw.setHeader('connection', 'keep-alive');
    raw.flushHeaders();

    let interval;
    const stop = () => clearInterval(interval);
    const send = async () => {
      if (raw.destroyed || raw.writableEnded) return stop();
      try {
        const metrics = await collectMetrics();
        if (raw.destroyed || raw.writableEnded) return stop();
        raw.write(`event: metrics\ndata: ${JSON.stringify(metrics)}\n\n`);
      } catch {
        // If metrics collection fails, send a safe default so the stream keeps alive
        if (raw.destroyed || raw.writableEnded) return stop();
        raw.write(`event: metrics\ndata: {"memory":0,"load":0,"unit":"bytes"}\n\n`);
      }
    };

    await send();
    interval = setInterval(send, 2000);
    request.raw.on('close', stop);
    request.raw.on('error', stop);

    // Do NOT return anything - we already took over the response.
  });

  return app;
}