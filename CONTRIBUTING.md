# Contributing to Kanam Pulse

Thanks for considering a contribution. This repo is public and community-first,
and accessibility and privacy are treated as product features, not afterthoughts.
Please read this before opening an issue or PR.

## Reporting bugs

Open an issue with the **bug** template (or follow this shape in freeform issues):

- **What you expected** - the behavior you were trying to get.
- **What happened** - the actual result, including the exact error message.
- **Environment** - macOS version, Node version (`node -v`), browser, and how you
  ran the app (quick-start servers, `PORT` overrides, etc.).
- **Repro steps** - minimal steps to reproduce, ideally with a small script or
  the exact API calls you made.

Security-sensitive bugs (anything that could leak local data or bypass the
consent contract) should be reported privately first - don't post exploit
details publicly. See the privacy principles in the README.

## Proposing features

Start a **discussion** before writing code. Kanam Pulse has hard product lines:
local-first, zero telemetry, consent-driven destructive actions, trash-style
removal (never immediate permanent delete), and WCAG 2.2 AA. Proposals that
cross those lines need a strong justification and an explicit decision - open a
discussion, not a PR, for anything non-trivial.

Small bug fixes and test/docs improvements can go straight to a PR.

## Development setup

Requirements: **Node.js >= 20** and npm.

```bash
npm ci                 # install all workspaces from the lockfile
npm run build          # build all workspaces (tsc for server, vite for web)
npm run test           # full test suite across workspaces (vitest)
npm run lint           # Biome check (lint + format)
npm run format         # apply Biome formatting
```

Useful scoped commands:

```bash
npm run test --workspace @kanam-pulse/core   # engine tests only
npm run test --workspace @kanam-pulse/server # API tests only
npm run test --workspace kanam-pulse-web     # dashboard + axe a11y tests
```

## Conventions

- **Code and comments in English.** GitHub-facing content (issues, PRs,
  comments) is English.
- **UI strings in Spanish** (the default locale, by SPEC decision), centralized
  in `packages/web/src/i18n/strings.ts` with a complete English pack. Add new
  strings to both packs.
- **Biome** is the only linter/formatter (no Prettier). Run `npm run lint`
  before pushing; CI enforces it.
- **Atomic commits**: one commit per logical change, imperative summary line
  (`fix(core): move cache contents to Trash instead of deleting`).
- **Destructive operations are trash-style**: cleanup moves files to the OS
  Trash, never permanent delete. Do not introduce `rm -rf`-style paths behind
  the consent flow.
- **No telemetry**: nothing may leave the machine except the user's own
  local-host API and, when enabled, a local Ollama instance. New dependencies
  must not add analytics or network calls.

## Pull requests

1. Fork the repo and create a branch off `main` (`git checkout -b fix/...`).
2. Make the change with tests. UI changes need updates to the axe-core
   accessibility suite (`packages/web/src/components/accessibility.test.tsx`)
   and must keep the flows keyboard-operable.
3. Run `npm run lint`, `npm run build`, and `npm run test` locally - all must
   pass.
4. Open the PR against `main`. CI runs lint + build + test on every PR (Node
   20, ubuntu-22.04); it must be green before merge.
5. Keep PRs focused. If a PR touches the consent/privacy flow, call it out in
   the description so reviewers focus there first.

## Code of conduct

Be kind and constructive. Harassment, personal attacks, or discriminatory
behavior of any kind is not tolerated. This project follows the spirit of the
[Contributor Covenant](https://www.contributor-covenant.org/); maintainers may
block or remove contributors who violate it.
