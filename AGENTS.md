# AGENTS.md — Razzoozle Agent Onboarding

Razzoozle is a Kahoot-style live quiz game, a branded fork/twin of `rahoot`
(same upstream, own repo — see `git remote -v`: `rahoot-upstream`). It is a
pnpm monorepo (`packages/common`, `packages/socket`, `packages/web`,
`packages/mcp`) **plus** a parallel Rust workspace (`rust/`, its own Cargo
workspace with `engine`, `protocol`, `server` crates). Both stacks run as
**two separate backends against ONE shared Postgres** (`razzoozle_postgres`):
the Node/socket.io server is the default/production path, the Rust server is
an opt-in preview reachable via a `/_rust/*` proxy route. `packages/mcp` is a
host-only dev tool, excluded from the pnpm workspace (see `pnpm-workspace.yaml`).

## Key Commands (run from `source/`)

```bash
pnpm --filter @razzoozle/socket run types   # tsc --noEmit, the fast typecheck loop
pnpm --filter @razzoozle/socket run test    # vitest run — suite is FULLY GREEN
                                             # (555 passed / 0 failed / 6 skipped, since 2026-07-07).
                                             # Any red test is YOUR regression: fix it or revert
                                             # before merging. Skipped tests are DB-guarded
                                             # (need DATABASE_URL).
pnpm verify                                 # repo-wide: types + oxlint + tests (root package.json)
pnpm g:console <Name>                       # Scaffold 100% token-compliant Admin Console component + test
pnpm g:menu <Name>                          # Scaffold 100% token-compliant Admin Menu/Nav component + test
pnpm g:question <Name>                      # Scaffold 100% token-compliant Quiz/Answer Tile component + test
pnpm g:display <Name>                       # Scaffold 100% token-compliant Kiosk Display stage component + test
pnpm g:player <Name>                        # Scaffold 100% token-compliant Mobile Phone Client component + test
pnpm tokens:build                           # Auto-build W3C design.tokens.json -> CSS & TS types
bash rust/gate.sh                           # deterministic Rust gate — run after EVERY Rust
                                             # worker return, before committing. Never trust a
                                             # worker's self-report.
docker build -f rust/Dockerfile -t razzoozle-rust:latest .   # MUST run from source-root
                                             # (build context = repo root; rust/Dockerfile COPYs
                                             # both rust/ and config/quizz from there)
```

## Architecture Map

- **Node socket handlers** — `packages/socket/src/handlers/` (`game.ts`, `quizz.ts`,
  `display.ts`, `ai.ts`, `media.ts`, `results.ts`, `catalog.ts`, `theme-*.ts`,
  `submitMedia*.ts`, plus a `manager/` subfolder). This is where socket.io events
  are wired to services.
- **Round/game loop** — `packages/socket/src/services/game/round-manager.ts` is a
  thin barrel; the actual logic lives split under
  `packages/socket/src/services/game/round-manager/` (`scoring.ts`, `snapshot.ts`,
  `auto-mode.ts`, `pause-resume.ts`, `round-recap.ts`, `achievement-awards.ts`,
  `achievement-config.ts`). Same barrel+split pattern for
  `packages/socket/src/services/config.ts` → `packages/socket/src/services/config/`
  (`shared`, `game-config`, `achievements`, `quizz`, `theme`, `plugins`, `init`, ...).
  When splitting a monolith further, follow this exact pattern: barrel file keeps
  the public import path stable, submodules hold the SRP logic.
- **Storage** — `packages/socket/src/services/storage/` picks a repository via the
  `DATABASE_MODE` env var: unset/`file` → `FileSystemRepository` (writes
  `config/*.json`), `dual` → `DualWriteRepository` (FS + Postgres), `pg`/`pg-only`
  → `PostgresRepository`. Falls back to `file` with a warning if `DATABASE_URL` is
  missing for a DB mode.
- **Rust engine** — socket handlers in `rust/server/src/socket/` (`game.rs`,
  `player.rs`, `display.rs`, `results.rs`, `cooldown.rs`, `lifecycle.rs` for
  connect/disconnect/reconnect, plus a `manager/` subfolder mirroring the admin
  surface: `auth.rs`, `quizz.rs`, `catalog.rs`, `theme.rs`, `game_flow.rs`, ...).
  `rust/engine` holds pure game-state logic, `rust/protocol` holds the `ts-rs`
  generated wire types shared with the TS client.

## Player Test-Viewports (Pflicht)

Jede visuelle / Design- / Layout-Verifikation des Player-Clients läuft über ALLE
drei Portrait-Auflösungen (klein → groß, CSS-logical px). Fest verankert; nicht
an einem Zufalls-Viewport testen (dort entstehen Squish-/Overlap-Fehldiagnosen).

| Gerät | Breite × Höhe | DPR |
|---|---|---|
| iPhone 8 | 375 × 667 | 2 |
| iPhone 13 | 390 × 844 | 3 |
| iPhone 17 Pro Max | 440 × 956 | 3 |

Playwright: `browser_resize` auf jede Auflösung, dann Solo-Flow durchspielen
(`/quizz/e2e-all-ty-pKcA4Qj2/solo`, alle Fragetypen). Details + Rationale:
`.claude/state/TEST_VIEWPORTS.md`.

## Gotchas

- **`config/` and `node_modules/` are gitignored at repo root.** A fresh
  `git worktree add` will NOT have them — tests fail with "0 quizzes" and pnpm
  commands fail with missing deps. Symlink `config/` (and run `pnpm install` or
  symlink `node_modules/`) from the main tree into every new worktree before
  running anything.
- **`scratchpad/` is also gitignored** — safe for scratch files, but don't expect
  it to survive a fresh clone/worktree.
- **`CLAUDE.md`, `AGENTS.md`, `GEMINI.md` are gitignored at repo root too**
  (commit `4fcc2834`: "stop publishing AI/orchestration files"). They exist on
  disk in the main tree but a fresh worktree won't have them, and committing
  edits to them requires `git add -f` (intentional — this repo has a public
  GitHub mirror alongside the private Gitea `origin`).
- **socketioxide no-payload handlers** must use the bare `|socket: SocketRef|`
  closure signature — adding `Data::<Value>` to a handler that receives no
  payload silently blocks the event (see `rust/server/src/socket/ai.rs`).
- **Client-emitted vs. Rust-handled events must be cross-checked every time.**
  A client `socket.emit(...)` with no matching Rust handler hangs silently (no
  error, spinner never resolves) — this happened for real with `quizz:update`.
  Before shipping a new client-emitted event, grep both
  `packages/socket/src/handlers/` and `rust/server/src/socket/` for it.
- **Container topology differs per backend.** Node runs via `docker compose`
  (container `razzoozle`, prod port `:3011`). Rust runs as a hand-run container
  (`docker run ... --restart unless-stopped`, prod port `:3012`), NOT part of
  `compose.yml`. Caddy proxies `/_rust/*` (`handle_path`, prefix stripped) to
  the Rust container and everything else to the Node container.

## Worker Rules

- Always isolate in a `git worktree` per agent/task — never edit the shared
  main tree directly.
- Use `Edit` on existing files, not `Write` — `Write`-ing over an existing file
  risks silent verbatim-mangling on large files.
- Keep new/edited modules under ~400 lines (soft nudge). `monolith-guard`
  hard-denies any brand-new single-`Write` code file above 600 lines — split
  into single-responsibility modules with a thin barrel instead (see
  Architecture Map above for the established pattern).
- **Design Tokens & Component Generators**: NEVER hand-write brand new UI components from scratch. ALWAYS use the CLI domain generators (`pnpm g:console`, `pnpm g:menu`, `pnpm g:question`, `pnpm g:display`, `pnpm g:player`) to scaffold token-compliant components with auto-generated Vitest tests. NEVER hardcode arbitrary hex colors (`#7c3aed`, `#22c55e`, etc.) or unmapped `[var(--...)]` arbitrary classes in UI components. Always use mapped Tailwind v4 utility classes (`bg-answer-1`, `text-accent-contrast`, `bg-status-online-bg`, `bg-surface-2`, `text-ink`, etc., defined in `index.css`). For JS/Canvas/Confetti dynamic color references, use `getThemeTokenCssVar()` from `@razzoozle/common/theme-tokens` for type-safe CSS token access (`CssTokenName`).


