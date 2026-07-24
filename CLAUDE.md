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
pnpm tokens:validate                         # Lint codebase for unmapped arbitrary tokens
pnpm tokens:fix                              # Auto-rewrite arbitrary var() syntax to Tailwind v4 tokens
```

See `AGENTS.md` for package-scoped commands (`pnpm --filter @razzoozle/socket ...`),
the Rust gate (`bash rust/gate.sh`), and the Docker build.

