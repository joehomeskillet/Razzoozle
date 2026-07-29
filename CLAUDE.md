# CLAUDE.md — Razzoozle Developer Guide

**Agents: read `AGENTS.md` first** (project map, architecture, gotchas, worker
rules). This file only holds command reference.

## 1. RTK (Rust Token Killer) Commands

All development commands should be executed with the `rtk` prefix to optimize token usage (Claude Code automatically rewrites these).

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
rtk --version         # Verify RTK version
```

## 2. Build & Development Commands

Execute these from `source/` folder:
```bash
pnpm dev              # Start both frontend and backend dev servers
pnpm dev:web          # Start web client dev server
pnpm dev:socket       # Start socket backend dev server
pnpm build            # Build all packages
pnpm verify           # Run typecheck, linting, and tests
pnpm test             # Run test suites
pnpm format:fix       # Format code with Prettier
```

## 3. Component Generator & Token Commands

Use CLI domain generators when creating new UI components:
```bash
pnpm g:console <Name>                        # Admin Console component + test
pnpm g:menu <Name>                           # Admin Menu/Nav component + test
pnpm g:question <Name>                       # Quiz Answer Tile component + test
pnpm g:display <Name>                        # Display Stage component + test
pnpm g:player <Name>                         # Mobile Phone Client component + test
pnpm tokens:build                            # Build W3C tokens -> CSS, TS types & LIVING_DESIGN_SYSTEM.md
pnpm tokens:doc                              # Generate Living Design System spec table (docs/design/LIVING_DESIGN_SYSTEM.md)
pnpm tokens:validate                         # Regex linter for unmapped arbitrary tokens
pnpm tokens:hex-lint                         # Regex-based hardcoded hex color validator
pnpm tokens:wasm                             # Regex-based hex token replacer
pnpm tokens:morph                            # Regex-based inline style replacer
pnpm tokens:neural                           # Viewport auditor (375px/390px/440px)
pnpm tokens:ai-audit                         # AI Design System Governance Audit
pnpm tokens:daemon                           # Monorepo Refactoring Daemon
pnpm tokens:fix                              # Auto-rewrite arbitrary var() syntax to Tailwind v4 tokens
```

See `AGENTS.md` for package-scoped commands (`pnpm --filter @razzoozle/socket ...`),
the Rust gate (`bash rust/gate.sh`), and the Docker build.



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
     - `pnpm tokens:validate`   (Regex linter for unmapped var() syntax)
     - `pnpm tokens:hex-lint`   (Regex validator for hardcoded hex colors)
     - `pnpm tokens:wasm`       (Regex-based hex token replacer)
     - `pnpm tokens:morph`      (Regex-based inline style replacer)
     - `pnpm tokens:neural`     (Viewport auditor for 375px / 390px / 440px)
     - `pnpm tokens:ai-audit`   (AI Design System Governance Audit)
     - `pnpm tokens:daemon`     (Monorepo refactoring daemon)
