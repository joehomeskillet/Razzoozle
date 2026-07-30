#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const SOURCE_DIR = "packages/web/src"
const ALLOWED_FILES = new Set([
  "packages/web/src/features/game/utils/confetti.ts",
  "packages/web/src/experiences/shared/celebration/ConfettiAdapter.ts",
  "packages/web/src/features/game/components/states/Podium.tsx",
  "packages/web/src/features/results/SharePage.tsx",
])
const IMPORT_PATTERN =
  `(from[[:space:]]*|import[[:space:]]*(\\([[:space:]]*)?)` +
  `["'](canvas-confetti|react-confetti)(/[^"']*)?["']`

function report(message) {
  process.stderr.write(`CONFETTI-IMPORTS WARNING: ${message}\n`)
}

function main() {
  const result = spawnSync(
    "grep",
    [
      "-r",
      "-n",
      "-H",
      "-E",
      "--include=*.ts",
      "--include=*.tsx",
      "-e",
      IMPORT_PATTERN,
      "--",
      SOURCE_DIR,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  )

  if (result.error) {
    report(`grep could not execute: ${JSON.stringify(result.error.message)}`)
    return
  }

  if (result.status === 1) {
    process.stdout.write("CONFETTI-IMPORTS OK\n")
    return
  }

  if (result.status !== 0) {
    const detail = result.stderr.trim()
    report(
      `grep exited with status ${String(result.status)}` +
        (detail ? `: ${JSON.stringify(detail)}` : ""),
    )
    return
  }

  const unexpected = result.stdout
    .split("\n")
    .filter(Boolean)
    .filter((match) => {
      const separator = match.indexOf(":")
      return separator === -1 || !ALLOWED_FILES.has(match.slice(0, separator))
    })

  if (unexpected.length === 0) {
    process.stdout.write("CONFETTI-IMPORTS OK\n")
    return
  }

  for (const match of unexpected) {
    const location = /^([^:\n]+):([0-9]+):/.exec(match)
    report(
      location
        ? `unexpected import at ${location[1]}:${location[2]}`
        : `unexpected grep output ${JSON.stringify(match)}`,
    )
  }
}

try {
  main()
} catch (error) {
  report(
    `gate error: ${JSON.stringify(
      error instanceof Error ? error.message : String(error),
    )}`,
  )
}

process.exitCode = 0
