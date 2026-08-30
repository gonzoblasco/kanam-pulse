// src/app.js
// Local read-only HTTP API wrapping @kanam-pulse/core.
// GET-only surface; the core engine is the single source of truth.

import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import os from 'node:os';
import Fastify from 'fastify';
import { CHECKS, runBattery, readHistory } from '@kanam-pulse/core';

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