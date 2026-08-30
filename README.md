# Kanam Pulse

[![Status](https://img.shields.io/badge/status-pre--alpha-orange)](https://github.com/gonzoblasco/kanam-pulse)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Kanam Pulse is a local-first macOS health monitor and cleaner: a web dashboard that reads the real pulse of your machine (disk, memory, CPU, security, network) and helps you act on it with explicit, granular consent.

No telemetry. No accounts. Your data never leaves your machine.

## Why

Most cleanup tools either dump raw JSON at you, or push one-click "boost" buttons that hide what they are about to delete. Kanam Pulse takes the opposite approach:

- **Local-first AI**: an optional local model (via Ollama) explains your audit report in plain language - what is safe to clean, what you should not touch.
- **Consent by default**: destructive actions are opt-in, per target, with confirmation. Trash over delete. No automatic `--force` anywhere.
- **Accessibility as a feature**: built to WCAG 2.2 AA from day one - keyboard navigation, ARIA live regions for progress, accessible confirmation dialogs.
- **One engine, two surfaces**: the same health-check core powers this web dashboard and a terminal CLI.

## Status

Pre-alpha: engine is inherited from a validated CLI implementation (46 unit tests, real-machine validated). Web dashboard is under construction.

## Roadmap

| Milestone | Scope | State |
|---|---|---|
| M0 | Scaffold + spec | Done |
| M1 | Core engine extraction + read-only dashboard (checks + live metrics) | Next |
| M2 | Consent-driven fixes (caches, heavy processes) | Planned |
| M3 | Local AI audit summary (Ollama) | Planned |
| M4 | Accessibility pass + docs + polish | Planned |
| M5 | v1.0 release and community announcement | Planned |

## Platform

- macOS first (real `vm_stat` metrics, like Activity Monitor).
- Linux partially supported: checks degrade gracefully, some macOS-specific checks are skipped.

## Stack

- Node.js + ESM (server, no bundler required)
- Vite + React + TypeScript (dashboard)
- Ollama (optional, local AI)
- Vitest

## Getting Started

Not yet - the web dashboard lands in M1. Watch the repo or read [docs/SPEC-v1.md](docs/SPEC-v1.md) to see where this is going.

## Credits

Born from lessons learned refactoring [Moderno AI Cleaner Pro](https://github.com/Breacorp/MODERNO_AI_CLEANER_PRO) and building a terminal health-check that decided audits should be explained, not dumped.

## License

[MIT](LICENSE)