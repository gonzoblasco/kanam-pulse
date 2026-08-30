# SPEC - Kanam Pulse v1

> Draft 2026-08-29. Scope for the v1.0 release.

## Goal

A local macOS companion app that shows the real pulse of the machine and lets the user act on it - clean, kill, optimize - without ever doing anything destructive without explicit consent. Explains its findings in human language, locally, with no data leaving the machine.

## Non-Goals (v1)

- No Electron/desktop packaging (server + browser). Backlog post-v1: evaluar envoltorio nativo (Electron/Tauri/React Native/nativa) SOLO when the web v1 is complete and polished - distribution decision, not a product decision today
- No macOS App Store distribution
- No remote/cloud sync
- No scheduled automatic cleaning (manual with consent only)
- No telemetry, no crash reporting, no analytics

## Architecture

```
kanam-pulse/
  packages/
    core/        # engine: checks, metrics collectors, fix planners (TS, zero UI deps)
    server/      # HTTP API + SSE stream (Fastify), wraps core
    web/         # dashboard (Vite + React + TS, WCAG 2.2 AA baseline)
```

- `core` is the inherited engine: adapted from the validated CLI implementation (`system-health-check` v1.0.0). Tests port with the code. Target: 100% of the 46 inherited tests green in this repo.
- `server` exposes REST endpoints (checks, audit, history) + SSE for live metrics. Local-only bind (127.0.0.1) by default.
- `web` consumes the API. No bundler tricks in core, standard Vite in web.

## Features v1

1. **Dashboard (read-only)**
   - Health score by category (disk, memory, CPU, security, network), 0-100 weighted
   - Live metrics: memory (vm_stat anonymous - purgeable), CPU load + top processes, disk usage
   - History + trend (improving / declining / stable) persisted locally in `~/.kanam-pulse/history.json`

2. **Audit**
   - Full audit run (same checks), human-readable report
   - Findings labeled: safe to clean / review / do not touch

3. **Consent-driven fixes**
   - Cache cleanup by category (app/dev/npm/pip), dry-run first, per-target checkbox + explicit confirm dialog
   - Heavy process kill: protected processes (launchd, WindowServer, kernel) and the scan itself are non-selectable
   - All destructive operations use trash-style removal where available, never immediate permanent delete

4. **Local AI audit summary (optional)**
   - Detects Ollama; if present, offers "Explain this audit"
   - Prompt is summary-only (no file paths of user data), model optional (GLM Flash / Gemma)
   - If Ollama absent: feature hidden, never breaks

5. **Accessibility (non-negotiable)**
   - Full keyboard operation, visible focus
   - ARIA live regions for progress and status changes
   - Accessible confirmation dialogs (focus trap, restore focus)
   - Reduced-motion respect, contrast AA minimum
   - axe-core clean on every PR (CI)

## Security & Privacy Principles

- Binds to 127.0.0.1 only, no external exposure by default
- Zero telemetry, zero accounts
- No destructive action without explicit user confirmation in the same session
- Protected process blacklist is code, not config

## Milestones

- M0 (done): scaffold, spec, LICENSE, public repo
- M1: `packages/core` extraction (46 tests green) + read-only dashboard
- M2: fixes with consent flows
- M3: Ollama audit summary
- M4: a11y audit pass + docs + CI (lint, test, build)
- M5: v1.0.0 release + community launch

## Open Questions

- Linux support depth for v1 (checks degrade, but how much do we document?)
- Dashboard charts: lightweight custom SVG vs chart lib (decide in M1)
- i18n: Spanish default strings centralized now, English pack at M4?