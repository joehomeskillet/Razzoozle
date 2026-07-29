#!/usr/bin/env node
/**
 * scripts/design-gate.mjs — Unified Design System Gate
 *
 * Single deterministic pipeline that runs ALL token verification checks in
 * strict sequence. Exit code 0 = all clear, exit code 1 = violations found.
 *
 * Usage:
 *   pnpm tokens:gate          # full gate (blocks commit)
 *   pnpm tokens:gate --fix    # auto-fix first, then validate
 *
 * Integrated into:
 *   - `pnpm verify`           (repo-wide)
 *   - `rust/gate.sh`          (step 6)
 *   - `.gitea/workflows/`     (CI)
 *   - `.husky/pre-commit`     (local git hook, optional)
 */
import { execSync } from 'child_process'
import path from 'path'

const isFix = process.argv.includes('--fix')
const root = path.resolve(import.meta.dirname, '..')
const steps = []
let failures = 0
const startTime = Date.now()

function run(label, cmd, blocking = true) {
  const stepStart = Date.now()
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', timeout: 30_000 })
    const ms = Date.now() - stepStart
    steps.push({ label, status: '✔', ms })
    console.log(`  \x1b[32m✔\x1b[0m ${label} \x1b[90m(${ms}ms)\x1b[0m`)
  } catch (err) {
    const ms = Date.now() - stepStart
    if (blocking) {
      steps.push({ label, status: '✘', ms })
      console.log(`  \x1b[31m✘\x1b[0m ${label} \x1b[90m(${ms}ms)\x1b[0m`)
      failures++
    } else {
      steps.push({ label, status: '⚠', ms })
      console.log(`  \x1b[33m⚠\x1b[0m ${label} (advisory) \x1b[90m(${ms}ms)\x1b[0m`)
    }
  }
}

console.log('\n\x1b[36m╔══════════════════════════════════════════════════════════╗')
console.log('║       RAZZOOZLE UNIFIED DESIGN SYSTEM GATE              ║')
console.log('╚══════════════════════════════════════════════════════════╝\x1b[0m\n')

// --- Phase 1: Auto-fix (optional) ---
if (isFix) {
  console.log('\x1b[36m▸ Phase 1: Auto-Fix\x1b[0m')
  run('Token Lint Auto-Fix',          'node scripts/lint-design-tokens.mjs --fix',  false)
  run('AST Token Grep Auto-Fix',      'node scripts/ast-grep-tokens.mjs --fix',    false)
  run('Tailwind Arbitrary Class Fixer', 'node scripts/wasm-token-codemod.mjs --fix',  false)
  run('Inline Style Converter',   'node scripts/ast-morph-tailwind.mjs --fix',  false)
  run('Token Refactor Auto-Fix',     'node scripts/refactor-tokens.mjs --fix', false)
  console.log('')
}

// --- Phase 2: Validate (BLOCKING) ---
console.log('\x1b[36m▸ Phase 2: Validate (blocking)\x1b[0m')
run('Token Lint Validator',           'node scripts/lint-design-tokens.mjs')
run('AST Structural Hex Linter',      'node scripts/ast-grep-tokens.mjs')
run('Tailwind Arbitrary Class Linter', 'node scripts/wasm-token-codemod.mjs')
run('Inline Style Converter','node scripts/ast-morph-tailwind.mjs')
run('Viewport Pixel Compliance Checker', 'node scripts/validate-viewport-pixels.mjs')

// --- Phase 3: Governance (BLOCKING) ---
console.log('\n\x1b[36m▸ Phase 3: AI Governance\x1b[0m')
run('Design Governance Compliance Linter',      'node scripts/lint-governance-rules.mjs',      false)
run('Token Refactor Verifier',       'node scripts/refactor-tokens.mjs')

// --- Phase 4: Agent Sync (BLOCKING) ---
console.log('\n\x1b[36m▸ Phase 4: Agent Rule Sync\x1b[0m')
run('Unified Agent Rules Sync (8 files)', 'node scripts/sync-agent-rules.mjs')

// --- Verdict ---
const totalMs = Date.now() - startTime
console.log('')
if (failures === 0) {
  console.log(`\x1b[32m╔══════════════════════════════════════════════════════════╗`)
  console.log(`║  ✔ DESIGN GATE PASSED  (${totalMs}ms, ${steps.length} checks)               ║`)
  console.log(`╚══════════════════════════════════════════════════════════╝\x1b[0m`)
} else {
  console.log(`\x1b[31m╔══════════════════════════════════════════════════════════╗`)
  console.log(`║  ✘ DESIGN GATE FAILED  (${failures} blocking violation(s))       ║`)
  console.log(`╚══════════════════════════════════════════════════════════╝\x1b[0m`)
  process.exit(1)
}
