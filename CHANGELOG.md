# Changelog

This is the **Südhang** fork of [Razzia](https://github.com/) (a Kahoot-style
live quiz). It documents the changes this fork carries **beyond upstream** — it
is not the upstream changelog. The fork runs as a single Docker image
(nginx + node socket + supervisord) behind Caddy at `rahoot.joelduss.xyz`.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Südhang optimize pass] — 2026-06-06

An 8-wave hardening and optimization pass across the `common` / `socket` / `web`
pnpm monorepo. Headline results: TypeScript went **RED → GREEN** in all three
packages, the test suite grew **21 → 125** tests, oxlint findings dropped
**258 → ~110**, the player's initial payload shrank **~3.8 MB → ~1.1 MB**, and
the server was **load-proven at 600 concurrent players** (< 10% socket CPU) with
**crash-recovery verified by `kill -9`**.

### Added

- **Crash recovery.** The socket server now snapshots live game state and
  restores it on restart, so a hard crash (verified with `kill -9`) no longer
  loses an in-progress game.
- **Health & lifecycle.** Added a `/healthz` endpoint, graceful shutdown
  handling, and a Docker `HEALTHCHECK` so the container reports real readiness.
- **PWA.** Integrated `vite-plugin-pwa` with an event-safe service worker
  (registration is gated so it never disrupts a running quiz), plus matching
  nginx cache rules for the service worker.
- **Display robustness.** Host (manager) reconnects no longer kill the lobby —
  a grace window keeps the game alive across a brief manager blip.
- **Accessibility.** Keyboard drag-and-drop for ordering questions, a QR-code
  `title`, a player disconnect banner, a kick-confirmation step, and an
  accessible `ResultModal` dialog.

### Changed

- **Branding.** The themed `appTitle` ("Südhang Kahoot") now renders above the
  login screen in place of the default Razzia logo.
- **Display / beamer mode.** `/display` hides the manager-only controls so the
  beamer view is clean for the audience; the fullscreen button on the beamer was
  restored.
- **Kiosk legibility.** Question and answer text scale up for 4K beamer
  projection while staying phone-safe via `lg:` breakpoints.
- **Architecture.** Single-sourced shared types and constants in `common`,
  killed duplicate `DISPLAY` socket keys (a TS2717 build-breaker), broke the
  `answerColor` allocation cycle, centralized `DEFAULT_MANAGER_PASSWORD`, and
  added `Answer.clientId` plumbing. Input validation was hardened with Zod.
- **Motion.** Introduced a shared motion + scrim foundation for consistent,
  reduced-motion-aware transitions.
- **Copy.** Corrected the English "Quizz" → "Quiz".

### Fixed

- **`ResultModal` crash.** Resolved a runtime crash from nesting a
  `react-alert-dialog` `DialogTitle` inside a `react-dialog`.
- **Scoring.** Slider answers outside the configured tolerance no longer earn
  partial credit.
- **PWA deploys.** Switched the HTML shell to a `NetworkFirst` strategy so a new
  deploy lands after a single reload instead of a stale-cache wait.

### Performance

- **Initial payload ~3.8 MB → ~1.1 MB**, driven by converting `background.png`
  to WebP (2.7 MB → 91 KB) and by code-splitting.
- **Code-splitting.** Route-level splitting via TanStack Router's
  `autoCodeSplitting`, plus a separated vendor chunk.
- **Load.** Proven stable at **600 concurrent players** at under 10% socket CPU.
- Serving stack supports HTTP/3 (via Caddy) and PWA caching.

### Security

- **Path traversal fixed.** Client-supplied ids are no longer used directly to
  build file paths.
- **Dependency bump.** Pinned `ws` to `^8.20.1` via a pnpm override to address
  [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx).

### Tests

- Added **94 new Vitest tests** in the socket package covering display pairing,
  scoring, timers, the player↔manager lifecycle, config, the client registry,
  and game lifecycle.
- Overall suite grew **21 → 125** tests; a root `test` / `verify` gate
  (`types` + oxlint + tests) now runs across all packages.
- TypeScript compiles clean (**RED → GREEN**) in `common`, `socket`, and `web`;
  oxlint findings reduced **258 → ~110** (Prettier + oxlint `--fix` sweep, with
  a test-file override).

### i18n

- Localized all previously hardcoded German strings — `ConfigTheme`,
  `QuestionEditorType`, `ResultModal`, and host-facing strings — adding
  **68 keys** across **de / en / es / fr / it**.
