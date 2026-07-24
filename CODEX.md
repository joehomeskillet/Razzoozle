# CODEX.md — Razzoozle Developer & AI Agent Guide

Razzoozle is a Kahoot-style live quiz game (pnpm monorepo: `packages/common`, `packages/socket`, `packages/web`, `packages/mcp` + parallel Rust workspace `rust/`).
Always read `AGENTS.md` for architecture details and gotchas.

## Key Commands (run from `source/`)
- `pnpm verify` — repo-wide typecheck + oxlint + vitest tests
- `pnpm g:console <Name>` — scaffold 100% token-compliant Admin Console component + test
- `pnpm g:menu <Name>` — scaffold 100% token-compliant Admin Menu/Nav component + test
- `pnpm g:question <Name>` — scaffold 100% token-compliant Quiz/Answer Tile component + test
- `pnpm g:display <Name>` — scaffold 100% token-compliant Kiosk Display stage component + test
- `pnpm g:player <Name>` — scaffold 100% token-compliant Mobile Phone Client component + test
- `pnpm tokens:build` — auto-build W3C design.tokens.json -> CSS & TS types
- `pnpm tokens:validate` — lint codebase for unmapped arbitrary token usages
- `pnpm tokens:fix` — auto-rewrite arbitrary var() syntax to mapped Tailwind v4 tokens

## Mandatory Worker Rules
1. **Component Generators**: NEVER hand-write brand new UI components from scratch. ALWAYS use the CLI domain generators (`pnpm g:console`, `pnpm g:menu`, `pnpm g:question`, `pnpm g:display`, `pnpm g:player`) to scaffold token-compliant components with auto-generated Vitest tests.
2. **Design Tokens & UI Styling**: NEVER hardcode arbitrary hex colors (`#7c3aed`, `#22c55e`, etc.) or unmapped `[var(--...)]` arbitrary classes in UI components. Always use mapped Tailwind v4 utility classes (`bg-answer-1`, `text-accent-contrast`, `bg-status-online-bg`, `bg-surface-2`, `text-ink`, etc., defined in `index.css`). For JS/Canvas/Confetti dynamic color references, use `getThemeTokenCssVar()` from `@razzoozle/common/theme-tokens` for type-safe CSS token access (`CssTokenName`).
3. **Player Test Viewports**: Always verify visual changes to the player client across all 3 portrait viewports (iPhone 8: 375x667, iPhone 13: 390x844, iPhone 17 Pro Max: 440x956).
4. **Git Worktree Isolation**: Always isolate changes in a `git worktree` per task — never edit the main tree directly.
