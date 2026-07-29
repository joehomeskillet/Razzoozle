#!/usr/bin/env node
// check-ci-policy — guards against two CI incidents that already happened
// once each (2026-07-29):
//
//   1. pnpm-drift: a workflow's `pnpm/action-setup` step pinned a version
//      other than package.json's "packageManager" (was 9 vs pnpm@11.5.1) —
//      CI failed because the wrong pnpm ran against the lockfile.
//   2. push-to-main from GitHub: GitHub (github.com/joehomeskillet/Razzoozle)
//      is a stripped, read-only mirror of Gitea (ADR-002,
//      docs/adr/002-github-gitea-roles.md). `.github/workflows/` is never
//      even present on GitHub's checked-out tree there, but a workflow
//      living UNDER .github/ that pushes to main would create a commit that
//      only ever exists on the GitHub side and never reaches Gitea (the
//      authoritative repo). A `.gitea/workflows/` workflow pushing to its
//      own Gitea main is legitimate (that IS the source of truth) and is
//      intentionally NOT flagged.
//
// Usage: node scripts/check-ci-policy.mjs [--root <path>]
//   --root defaults to the repo root (two levels up from this file).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

const WORKFLOW_DIRS = [".github/workflows", ".gitea/workflows"];

// Lists every *.yml / *.yaml file under the given workflow dirs (relative
// to root), returning absolute paths. Missing dirs are silently skipped.
function listWorkflowFiles(root, dirs) {
  const files = [];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    let entries;
    try {
      entries = readdirSync(abs);
    } catch {
      continue; // dir doesn't exist — nothing to scan
    }
    for (const entry of entries) {
      const full = path.join(abs, entry);
      if (statSync(full).isFile() && /\.ya?ml$/.test(entry)) {
        files.push(full);
      }
    }
  }
  return files;
}

// Reads package.json's "packageManager" field (e.g. "pnpm@11.5.1") and
// returns just the version ("11.5.1").
function getExpectedPnpmVersion(root) {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const match = /^pnpm@(.+)$/.exec(pkg.packageManager ?? "");
  if (!match) {
    throw new Error(
      `package.json "packageManager" must be set to "pnpm@<version>" (found: ${JSON.stringify(pkg.packageManager)})`,
    );
  }
  return match[1];
}

// Finds every `pnpm/action-setup` step's pinned `version:` across
// .github/workflows and .gitea/workflows and flags any that disagree with
// package.json's packageManager version.
export function checkPnpmDrift(root = DEFAULT_REPO_ROOT) {
  const expected = getExpectedPnpmVersion(root);
  const violations = [];

  for (const file of listWorkflowFiles(root, WORKFLOW_DIRS)) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/uses:\s*pnpm\/action-setup@/.test(lines[i])) continue;
      // The version lives a few lines below, under a `with:` block.
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const versionMatch = /version:\s*["']?([\w.-]+)["']?/.exec(lines[j]);
        if (versionMatch) {
          const found = versionMatch[1];
          if (found !== expected) {
            violations.push({
              kind: "pnpm-drift",
              file: path.relative(root, file),
              found,
              expected,
            });
          }
          break;
        }
      }
    }
  }
  return violations;
}

// Flags any `.github/workflows/` step that pushes to `main` (directly or
// via `origin main` / `refs/heads/main`). Scoped to .github/ only — see the
// ADR-002 note in the module header for why .gitea/ pushes are exempt.
export function checkGithubPushToMain(root = DEFAULT_REPO_ROOT) {
  const violations = [];
  const pushToMainRe = /git\s+push\s+(\S+\s+)?(refs\/heads\/)?main\b/;

  for (const file of listWorkflowFiles(root, [".github/workflows"])) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const line of lines) {
      if (pushToMainRe.test(line)) {
        violations.push({
          kind: "push-to-main",
          file: path.relative(root, file),
          line: line.trim(),
        });
      }
    }
  }
  return violations;
}

export function runChecks(root = DEFAULT_REPO_ROOT) {
  return [...checkPnpmDrift(root), ...checkGithubPushToMain(root)];
}

function formatViolation(v) {
  if (v.kind === "pnpm-drift") {
    return `[pnpm-drift] ${v.file}: pnpm/action-setup pins version "${v.found}", but package.json packageManager expects "${v.expected}"`;
  }
  return `[push-to-main] ${v.file}: GitHub workflow pushes to main ("${v.line}") — GitHub is a read-only mirror (ADR-002); that commit would never reach Gitea`;
}

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const root = rootIdx !== -1 ? path.resolve(args[rootIdx + 1]) : DEFAULT_REPO_ROOT;

  const violations = runChecks(root);
  if (violations.length === 0) {
    console.log("CI-POLICY OK: no pnpm drift, no GitHub push-to-main");
    return 0;
  }

  console.log(`CI-POLICY FAILED: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.log(formatViolation(v));
  }
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
