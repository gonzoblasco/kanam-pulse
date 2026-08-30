# BRIEF - Project Overview

## What

Kanam Pulse: local-first macOS health monitor and cleaner. Web dashboard + local server reading real system metrics (disk, memory, CPU, security, network) with consent-driven fixes and a local AI layer that explains audits in plain language. Open source, MIT.

## Why

Origin: reverse of the CLI path. We refactored Breacorp's Moderno AI Cleaner Pro (monolith, ~10K lines) into a modular web app, then built our own terminal health-check (system-health-check). Now the loop closes: a web product on top of that validated engine, done better - TypeScript, a11y-first, local AI, granular consent. Community-facing open source and portfolio piece.

## Stack

- Node.js + ESM server (Fastify, SSE or WebSocket for live metrics)
- Vite + React + TypeScript (dashboard UI)
- Core engine extracted from `system-health-check` (Node + ESM + Vitest, validated v1.0.0)
- Ollama local models for audit summaries (GLM Flash or Gemma)
- Lucide icons, WCAG 2.2 AA baseline

## Status

- [x] Discovery
- [x] Definition
- [ ] In Development
- [ ] Live
- [ ] Archived

## Key Decisions

- **Kanam Pulse (name)** - "Boost" sounds like a 2000s optimizer; Pulse evokes health, monitoring, vitality. Chosen by Kanam, approved by Gonzo (2026-08-29).
- **Public repo, community-first** - explicit Gonzo decision. No telemetry, no accounts, no data leaving the machine.
- **Server local + web UI, no Electron in v1** - same path as the Breacorp refactor; simpler, testable.
- **Engine inherited, not rewritten** - checks + fix logic start from system-health-check code (check modules are isolated by design: one failing check never kills the battery).
- **`vm_stat` real for RAM** - anonymous minus purgeable, same technique as Activity Monitor (lesson from Breacorp's app).
- **Consent granularity as product principle** - dry-run first, per-target confirmation, trash over delete, protected processes never touchable, no automatic force.
- **A11y is the differentiator** - not a checkmark: keyboard-first flows, ARIA live progress, accessible confirmations for every destructive action.
- **AI is local or nothing** - audit explanations run on Ollama; if no model available, the feature degrades to raw JSON with human-readable labels, never sends data anywhere.
- **UI strings Spanish by default, i18n-ready from day one** (centralized strings), code and docs in English.