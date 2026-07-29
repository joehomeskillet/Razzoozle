# CLAUDE.md — Razzoozle Developer Guide

**Agents: read `AGENTS.md` first** for project map, architecture, gotchas, worker
rules, and all CLI commands. This file only provides Claude-specific guidance.

## RTK (Rust Token Killer) Commands

All development commands should be executed with the `rtk` prefix to optimize token usage (Claude Code automatically rewrites these).

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
rtk --version         # Verify RTK version
```

Refer to `AGENTS.md` §Key Commands for all repository operations (`pnpm verify`, `pnpm g:*`, `pnpm tokens:*`, `bash rust/gate.sh`, Docker builds).

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
     - `pnpm tokens:hex-lint`   (AST structural linter for hardcoded hex attributes & inline styles)
     - `pnpm tokens:wasm`       (High-speed SWC/AST token codemod transformer)
     - `pnpm tokens:morph`      (AST-Morph zero-runtime Tailwind v4 compiler)
     - `pnpm tokens:neural`     (Viewport pixel compliance checker (375px/390px/440px))
     - `pnpm tokens:ai-audit`   (Design governance compliance linter)
     - `pnpm tokens:daemon`     (Token deprecation batch replacer)
<!-- END UNIFIED DESIGN GOVERNANCE RULES -->
