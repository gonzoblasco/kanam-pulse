# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v1.0.0 (next)

First public release. The repo ships as a monorepo (npm workspaces) with a
local-first health-check engine, a consent-driven fixes API, a read-only web
dashboard, and a local AI audit summary.

### Added

- **Monorepo scaffold** (`M0`/`M1`): npm workspaces with `packages/core`
  (engine), `packages/server` (Fastify API, binds 127.0.0.1 only) and
  `packages/web` (Vite + React + TypeScript dashboard).
- **Health-check engine** (`@kanam-pulse/core`, zero runtime dependencies):
  disk, memory (real `vm_stat` telemetry, Activity Monitor-accurate), CPU,
  security, and network checks; weighted overall score (25/25/20/15/15) mapped
  to `healthy` / `attention` / `degraded`; run history with trend summary;
  terminal + JSON reporters. Inherited from `system-health-check` v1.0.0.
- **Read-only dashboard** (`packages/web`): overall score, per-check status,
  and fixes panel; live memory + load-average metrics over SSE
  (`GET /api/metrics/stream`).
- **Consent-driven fixes** (`M2`): `GET /api/fixes/scan` (well-known cache
  locations + heavy processes only, never user data), `POST /api/fixes/dry-run`
  (estimates without executing), `POST /api/fixes/apply` (requires explicit
  per-target selection, a confirmation dialog, and `confirmed: true`); strict
  protected-process list.
- **Local AI audit summary** (`M3-U1`): "Explain this audit" sends only
  aggregate, privacy-sanitized metrics to a local Ollama instance; never paths
  or file contents; degrades gracefully when Ollama is not running.
- **Test runner** (`M3-U2`): Vitest + React Testing Library across all
  workspaces (jsdom for the web), 116 tests total.
- **Accessibility test gate** (`M4`): axe-core + vitest-axe in the web suite;
  the build fails on `serious`/`critical` violations.
- **i18n** (`M4`): all user-facing strings centralized in
  `packages/web/src/i18n/strings.ts`, Spanish default (SPEC decision), complete
  English pack.
- **CI** (`M4`): GitHub Actions pipeline (install → lint → build → test) on
  push to `main` and pull requests.
- **Release hygiene** (`M5-U1`): Biome lint/format wired at the monorepo root
  and gated in CI; this changelog.
- **Docs**: README (quick start, features, architecture, roadmap), SPEC v1,
  MIT license, `docs/`, public `.knowledge/` (BRIEF, HANDOFF, STATUS).

### Changed

- Engine layout reorganized from the original `system-health-check` single
  package into the monorepo `packages/*` structure.
- README overhauled for the public launch (`M4`): current status, feature
  guide, roadmap, contributing guidelines.
- Web test config (`M4`): vitest 3 + jsdom + vitest-axe setup; tests live next
  to their sources under `src/**`.

### Fixed

- `M2` server endpoints refuse apply requests without `confirmed: true`
  (defense in depth for the consent contract).
- `M3-U1` audit summary never includes file paths or personal data in the
  Ollama prompt (privacy guard).
- Web dashboard renders a11y-safe confirmation flows (React `useId`-based
  ids, no `querySelector` on generated ids in tests).

## [0.1.0] — 2026-08-30 (pre-alpha, not published)

Internal scaffold commits (`M0`): initial repo setup, monorepo layout,
specification v1, README and license. Not released to any registry.
