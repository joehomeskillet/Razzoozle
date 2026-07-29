# AGENTS.md — Razzoozle Agent Onboarding

Razzoozle is a Kahoot-style live quiz game, a branded fork/twin of `rahoot`
(same upstream, own repo — see `git remote -v`: `rahoot-upstream`). It is a
pnpm monorepo (`packages/common`, `packages/web`, `packages/mcp`) **plus** a
parallel Rust workspace (`rust/`, its own Cargo workspace with `engine`,
`protocol`, `server` crates). The Rust server is the primary backend against
ONE shared Postgres database (`razzoozle_postgres`). `packages/mcp` is a
host-only dev tool, excluded from the pnpm workspace (see `pnpm-workspace.yaml`).

## Key Commands (run from `source/`)

```bash
pnpm verify                                 # repo-wide: tokens:gate + types + oxlint + tests (root package.json)
pnpm g:console <Name>                       # Scaffold 100% token-compliant Admin Console component + test
pnpm g:menu <Name>                          # Scaffold 100% token-compliant Admin Menu/Nav component + test
pnpm g:question <Name>                      # Scaffold 100% token-compliant Quiz/Answer Tile component + test
pnpm g:display <Name>                       # Scaffold 100% token-compliant Kiosk Display stage component + test
pnpm g:player <Name>                        # Scaffold 100% token-compliant Mobile Phone Client component + test
pnpm tokens:build                           # Auto-build W3C design.tokens.json -> CSS, TS types & LIVING_DESIGN_SYSTEM.md
pnpm tokens:doc                             # Auto-generate Living Design System spec table (docs/design/LIVING_DESIGN_SYSTEM.md)
pnpm tokens:validate                        # Check codebase for unmapped arbitrary token usages
pnpm tokens:ast                             # AST structural linter for hardcoded hex attributes & inline styles
pnpm tokens:wasm                            # High-speed SWC/AST token codemod transformer (sub-20ms)
pnpm tokens:morph                           # AST-Morph zero-runtime Tailwind v4 compiler
pnpm tokens:neural                          # Neural-Design-Core viewport auditor (375px/390px/440px)
pnpm tokens:ai-audit                        # Dual-Pass AI Design System Governance Audit
pnpm tokens:daemon                          # Autonomous Monorepo Refactoring Daemon
pnpm tokens:fix                             # Auto-rewrite arbitrary var() syntax to mapped Tailwind v4 tokens
bash rust/gate.sh                           # deterministic Rust gate — run after EVERY Rust
                                             # worker return, before committing. Never trust a
                                             # worker's self-report.
docker build -f rust/Dockerfile -t razzoozle-rust:latest .   # MUST run from source-root
                                             # (build context = repo root; rust/Dockerfile COPYs
                                             # both rust/ and config/quizz from there)
```

## Architecture Map

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
  Before shipping a new client-emitted event, grep `rust/server/src/socket/` to
  verify the Rust handler exists.
- **Container topology.** Razzoozle runs in Kubernetes with a single Rust backend
  container (`razzoozle-rust`). Caddy proxies WebSocket and REST API traffic to the
  Rust server on `:3012`. The `docker compose` setup and Node.js backend
  (`packages/socket`, deleted 2026-07-15) are no longer in use.

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




<!-- UNIFIED DESIGN SYSTEM GOVERNANCE RULES (AUTO-SYNCED) -->
# MANDATORY UI & DESIGN SYSTEM GOVERNANCE RULES FOR ALL AI AGENTS

1. **NEVER Hand-Write UI Components From Scratch**:
   - ALWAYS use CLI domain generators:
     - `pnpm g:console <Name>`   -> Scaffold Admin Console component + Vitest test
     - `pnpm g:menu <Name>`      -> Scaffold Admin Menu/Nav component + Vitest test
     - `pnpm g:question <Name>`  -> Scaffold Quiz/Answer Tile component + Vitest test
     - `pnpm g:display <Name>`   -> Scaffold Kiosk Display stage component + Vitest test
     - `pnpm g:player <Name>`    -> Scaffold Mobile Phone Client component + Vitest test

2. **NO Hardcoded Hex Colors or Arbitrary Unmapped Class Syntax**:
   - Hardcoded hex styles (e.g. `#7c3aed`, `#22c55e`) or unmapped arbitrary classes (e.g. `bg-[#7c3aed]`) are STRICTLY FORBIDDEN.
   - ALWAYS use mapped Tailwind v4 semantic utility classes (`bg-brand-primary`, `bg-answer-1`, `bg-surface-2`, `text-ink`, `bg-status-online-bg`).
   - For JS/Canvas/Confetti dynamic color references, ALWAYS use `getThemeTokenCssVar()` from `@razzoozle/common/theme-tokens`.

3. **Mandatory CLI Verification Chain**:
   - Before completing any UI task, ALWAYS run:
     - `pnpm tokens:validate`   (Check for unmapped arbitrary token usages)
     - `pnpm tokens:ast`        (AST structural linter for hardcoded hex & inline styles)
     - `pnpm tokens:wasm`       (High-speed SWC/AST token codemod transformer)
     - `pnpm tokens:morph`      (Zero-runtime Tailwind v4 compiler)
     - `pnpm tokens:neural`     (Viewport auditor for 375px / 390px / 440px)
     - `pnpm tokens:ai-audit`   (Dual-Pass AI Design System Governance Audit)
     - `pnpm tokens:daemon`     (Autonomous monorepo refactoring daemon)
<!-- END UNIFIED DESIGN GOVERNANCE RULES -->
