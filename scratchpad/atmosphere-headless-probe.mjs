#!/usr/bin/env node
/**
 * Garden atmosphere headless probe — Node entry point.
 *
 * Wraps the real probe (`scratchpad/atmosphere-headless-probe.test.ts`,
 * a vitest test) in a `node` shim. A stand-alone `node` script cannot
 * import from `@razzoozle/*` workspace aliases — those resolve only via
 * vitest's Vite-backed config — so this shim does NOT import the probe;
 * it spawns `pnpm exec vitest run` against the test file, captures the
 * output, writes it to `scratchpad/atmosphere-probe.txt`, and prints a
 * single PASS/FAIL line.
 *
 * Pre-flight checks:
 *   - the probe's vitest test file exists at the expected worktree path
 *   - `pnpm` and `vitest` are on PATH (vitest resolution happens inside
 *     `packages/web`, where vitest is installed as a dev dependency)
 *
 * Run from the worktree root (or anywhere; the script derives absolute
 * paths from its own location):
 *
 *   node scratchpad/atmosphere-headless-probe.mjs
 *
 * Exit code: 0 on PASS, non-zero on FAIL or any pre-flight error.
 */
import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const WORKTREE_ROOT = resolve(__dirname, "..")
const PACKAGES_WEB = resolve(WORKTREE_ROOT, "packages/web")
const PROBE_TEST_PATH = resolve(__dirname, "atmosphere-headless-probe.test.ts")
const PROBE_OUTPUT_PATH = resolve(__dirname, "atmosphere-probe.txt")
const PROBE_VITEST_CONFIG = "/tmp/opencode/vitest-probe.config.ts"

function which(bin) {
  const pathEnv = process.env.PATH ?? ""
  const dirs = pathEnv.split(":")
  for (const dir of dirs) {
    const candidate = resolve(dir, bin)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function fail(message) {
  console.error(`[atmosphere-headless-probe] FAIL — ${message}`)
  process.exit(1)
}

if (!existsSync(PROBE_TEST_PATH)) {
  fail(`probe test file missing: ${PROBE_TEST_PATH}`)
}
if (!existsSync(PACKAGES_WEB)) {
  fail(`packages/web not found at ${PACKAGES_WEB} (run from a fresh worktree)`)
}
if (!existsSync(PROBE_VITEST_CONFIG)) {
  fail(
    `vitest probe config missing: ${PROBE_VITEST_CONFIG} ` +
      `(create a vitest-probe.config.ts that extends @razzoozle/web alias to the scratchpad path)`,
  )
}

const pnpmPath = which("pnpm")
if (!pnpmPath) fail("pnpm not found on PATH")
const vitestPath = which("vitest") ?? resolve(PACKAGES_WEB, "node_modules/.bin/vitest")
if (!existsSync(vitestPath)) {
  fail(
    `vitest not found at ${vitestPath} (vitest ships as a dev dependency in packages/web)`,
  )
}

console.log(
  `[atmosphere-headless-probe] spawning vitest against ${PROBE_TEST_PATH}`,
)

const vitestArgs = [
  "exec",
  "vitest",
  "run",
  "--config",
  PROBE_VITEST_CONFIG,
  "--reporter=default",
  PROBE_TEST_PATH,
]

const child = spawn(pnpmPath, vitestArgs, {
  cwd: PACKAGES_WEB,
  stdio: ["ignore", "pipe", "pipe"],
})

const chunks = []
child.stdout.on("data", (data) => chunks.push(data))
child.stderr.on("data", (data) => chunks.push(data))

child.on("error", (err) => {
  fail(`spawn error: ${err.message}`)
})

/** Strip ANSI escape codes — they pollute the captured file with raw CSI
 *  bytes that `git diff --check` flags as trailing whitespace. */
function stripAnsi(input) {
  return input.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
}

/** Trim trailing whitespace per line and collapse 3+ blank lines so the
 *  output is git-clean (no trailing-whitespace, no blank-line-at-EOF). */
function sanitizeForGit(input) {
  return input
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "\n")
}

child.on("close", (code) => {
  const rawOutput = Buffer.concat(chunks).toString("utf8")
  const output = sanitizeForGit(stripAnsi(rawOutput))
  const header = [
    `================================================================================`,
    ` GARDEN ATMOSPHERE HEADLESS PROBE — run via node shim`,
    ` worktree: ${WORKTREE_ROOT}`,
    ` packages/web: ${PACKAGES_WEB}`,
    ` vitest exit code: ${code ?? "null"}`,
    ` reporter: default (vitest 4.x no longer ships 'basic'; equivalent verbosity)`,
    `================================================================================`,
    "",
  ].join("\n")
  const fileBody = header + output
  try {
    writeFileSync(PROBE_OUTPUT_PATH, fileBody, "utf8")
  } catch (writeErr) {
    console.error(
      `[atmosphere-headless-probe] FAIL — could not write ${PROBE_OUTPUT_PATH}: ${writeErr.message}`,
    )
    process.exit(1)
  }

  if (code === 0) {
    console.log("[atmosphere-headless-probe] PASS — probe re-run wrote scratchpad/atmosphere-probe.txt")
    process.exit(0)
  } else {
    console.error(
      `[atmosphere-headless-probe] FAIL — vitest exited with code ${code}; see scratchpad/atmosphere-probe.txt`,
    )
    process.exit(code ?? 1)
  }
})