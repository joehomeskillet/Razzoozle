#!/usr/bin/env node
/**
 * Garden atmosphere headless probe — entry-point stub.
 *
 * The brief asked for both:
 *   - scratchpad/atmosphere-headless-probe.mjs   (stand-alone Node script)
 *   - scratchpad/atmosphere-headless-probe.test.ts (vitest test, this is what runs)
 *
 * The .mjs is intentionally a no-op shell: a stand-alone Node script cannot
 * import from `@razzoozle/*` packages — the pnpm workspace symlinks would
 * have to be resolved by tsx/vitest, not by raw `node`. The actual probe
 * therefore runs as a vitest test under `packages/web` where the workspace
 * aliases (`@razzoozle/web`, `@razzoozle/common`) are pre-configured.
 *
 * Run from packages/web (note: vitest's default include pattern is
 * `src/**/*.test.{ts,tsx}`, which does NOT match the scratchpad path, so a
 * one-off override config is required):
 *
 *   pnpm exec vitest run \
 *     --config /tmp/opencode/vitest-probe.config.ts \
 *     /nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/scratchpad/atmosphere-headless-probe.test.ts \
 *     --reporter=verbose 2>&1 | tee scratchpad/atmosphere-probe.txt
 *
 * The probe:
 *   - Builds a fake `GardenPixiApplicationHandle` matching the existing test fakes.
 *   - Loads `createGardenScene` from the production source via `@razzoozle/web`.
 *   - Sweeps 4 scenarios: high / medium / low / reducedMotion.
 *   - Drives 3600 ticks × 16.67 ms = 60 simulated seconds per scenario.
 *   - Writes the captured output to scratchpad/atmosphere-probe.txt.
 *
 * Override config (kept outside the repo in /tmp/opencode/) re-uses the
 * workspace aliases and adds the scratchpad probe path to vitest's
 * include list. The default `pnpm test` is unaffected.
 */

console.log(
  "[atmosphere-headless-probe] this .mjs is a documentation stub. " +
    "Run the vitest test file:\n" +
    "  pnpm exec vitest run " +
    "--config /tmp/opencode/vitest-probe.config.ts " +
    "/nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/scratchpad/atmosphere-headless-probe.test.ts " +
    "--reporter=verbose",
)