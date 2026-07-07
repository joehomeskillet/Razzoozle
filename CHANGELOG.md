# Changelog

This is **Razzoozle**, a fork of [Razzia](https://github.com/Ralex91/Razzia) (a
Kahoot-style live quiz). It documents the changes this fork carries **beyond
upstream** — it is not the upstream changelog. Razzoozle runs as a single Docker
image (nginx + node socket + supervisord) behind a reverse proxy; the reference
deployment is `razzoozle.joelduss.xyz`.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.2.0] — 2026-06-19

Code-health, security and accessibility release, plus a new manager addon
system. Full audit and recommendation ledger in `docs/health-audit/`.

### Added

- **Manager addon system** — upload, enable, and configure JavaScript addons
  from the manager console (own tab, capability badges, persisted config). Ships
  a copy-paste starter skeleton (`examples/plugins/starter/`) with an authoring
  contract (`ADDON-SKELETON.md`).

### Security

- **Hardened the unauthenticated surface** — per-game player cap and active-game
  cap, a quiz-existence check plus an entry cap on solo-score submission, a
  server-wide rate limit on the public solo endpoints, and a brute-force throttle
  on manager authentication. All limits are tunable named constants.

### Changed

- **Accessibility** — labelled answer sliders and text inputs with value
  announcements, AA-contrast placeholders, a labelled lobby pair-code input,
  reduced-motion-gated leaderboard animation, and focus-trapped modals.
- **Performance** — the ~1.9 MB avatar (DiceBear) bundle is now lazy-loaded off
  the universal join path (initials fallback until the picker is opened).
- **i18n** — locale parity across en/de/es/fr/it/zh and a localized share title.
- **Tooling** — lint driven to zero (oxlint), a CI lint step added, `oxlint`
  pinned, and assorted de-duplication / extraction refactors.

### Fixed

- Solo-score endpoint returned `500` instead of `404` for an unknown quiz id.

### Tests

- Suite now at **592 automated tests**, with new coverage for the security
  guards (zip-slip / rate-limit / caps) and previously untested critical paths
  (solo endpoints, team standings, theme + achievement persistence).


## [1.0.0] — 2026-06-15

First public Razzoozle release — [github.com/joehomeskillet/Razzoozle](https://github.com/joehomeskillet/Razzoozle).

### Added

- **Violet liquid-glass theme** — an opt-in glassmorphism style variant plus a
  live manager "Design" cockpit (colours, per-view backgrounds, logo, a
  Flat ⇄ Glass toggle, presets, contrast-aware pickers). The flat cream
  preset stays the default and renders byte-identical to before.
- **Kahoot-faithful game screens** — answer tiles with shape icons
  (triangle / diamond / circle / square), a circular countdown timer and an
  answers-received counter, on the presenter, player phone and desktop.
- Own npm scope `@razzoozle/*`, EN/DE/中文 README, renamed container, v1.0.0.

### Changed

- More spacing between manager-config nav items and Design-tab sections.
- Razzoozle branding throughout (no upstream logo flash on load).

## [Lobby + mobile bugfixes] — 2026-06-13

Three field-reported bugs, fixed and verified end-to-end (unit tests +
Playwright against a production container). See
`docs/bugfixes/2026-06-13-lobby-mobile-slider.md` for root-cause analysis and
Gitea issues #1–#3.

### Fixed

- **Lobby no longer kicks players on a transient disconnect (#1).** A brief
  network blip while *waiting* in the lobby (mobile wifi↔LTE switch, tab
  backgrounding, screen lock) used to remove the player immediately — on
  reconnect they were "not found" and bounced to the join screen. The lobby now
  graces a dropped player exactly like an in-progress game: the player is kept
  and `PLAYER.RECONNECT` recovers the session. A genuinely-gone player is cleared
  after a 45 s grace window so the host roster doesn't accumulate ghosts. An
  intentional in-app leave still removes immediately. Covered by 5 new socket
  tests; proven live (offline→online keeps the player in the game).
- **Small/old phones: all answers reachable, page scrolls (#2).** On short
  viewports two of the four answer tiles (or the slider's submit button) were cut
  off below the fold with no way to scroll. The player content area is now a
  proper scroll region (`min-h-0` + `overflow-y-auto`) and the question/media
  block no longer greedily claims the full height, so over-tall content is
  reachable instead of clipped. Tile padding is phone-first (`py-3 sm:py-5
  lg:py-10`); desktop/beamer layout is unchanged.
- **Slider renders in every browser (#3).** The range control used
  `appearance-none` without vendor pseudo-element styling, so the thumb was
  invisible/undraggable on Safari/iOS and older Android WebViews. Added explicit
  `::-webkit-slider-runnable-track` / `::-webkit-slider-thumb` (with thumb
  centering) and `::-moz-range-track` / `::-moz-range-thumb` rules under a
  dedicated `.quiz-range` class; the thumb uses the runtime theme accent.

## [Optimize pass] — 2026-06-06

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

- **Branding.** The themed `appTitle` now renders above the
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
