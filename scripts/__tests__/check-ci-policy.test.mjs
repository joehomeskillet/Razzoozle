// Tests for scripts/check-ci-policy.mjs.
//
// Two real incidents drove this gate:
//   1. pnpm-drift: workflows pinned pnpm/action-setup to version 9 while
//      package.json's "packageManager" said pnpm@11.5.1 -> CI failed.
//   2. push-to-main from GitHub: GitHub is a stripped read-only mirror
//      (ADR-002, docs/adr/002-github-gitea-roles.md) — a commit made by a
//      .github/ workflow pushing to main would never reach Gitea (the
//      authoritative repo). A .gitea/ workflow pushing to its own Gitea
//      main is fine (that IS the source of truth) and must NOT be flagged.
//
// IMPORTANT: every test operates on a throwaway temp directory
// (os.tmpdir()) and is torn down afterwards. No real repo file is ever
// written to.
//
// Run: node --test scripts/__tests__/check-ci-policy.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPnpmDrift,
  checkGithubPushToMain,
  runChecks,
} from "../check-ci-policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const CLI_PATH = path.resolve(__dirname, "../check-ci-policy.mjs");

// Builds a minimal throwaway repo: package.json + one .github and one
// .gitea workflow file. Returns the root dir; caller must clean it up.
function makeTempRepo({ pkgVersion = "11.5.1", githubYml, giteaYml } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "ci-policy-test-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "tmp", packageManager: `pnpm@${pkgVersion}` }, null, 2),
  );
  mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  mkdirSync(path.join(root, ".gitea/workflows"), { recursive: true });
  if (githubYml) {
    writeFileSync(path.join(root, ".github/workflows/test.yml"), githubYml);
  }
  if (giteaYml) {
    writeFileSync(path.join(root, ".gitea/workflows/test.yml"), giteaYml);
  }
  return root;
}

function runCli(root) {
  return spawnSync(process.execPath, [CLI_PATH, "--root", root], {
    encoding: "utf8",
  });
}

const CLEAN_YML = `
name: clean
jobs:
  build:
    steps:
      - uses: pnpm/action-setup@v3
        with:
          version: 11.5.1
`;

const DRIFTED_YML = `
name: drifted
jobs:
  build:
    steps:
      - uses: pnpm/action-setup@v3
        with:
          version: 9
`;

const GITHUB_PUSH_YML = `
name: pushes-to-main
jobs:
  sync:
    steps:
      - uses: pnpm/action-setup@v3
        with:
          version: 11.5.1
      - run: git push origin main
`;

test("checkPnpmDrift flags a workflow pinned to a version other than packageManager", (t) => {
  const root = makeTempRepo({ pkgVersion: "11.5.1", githubYml: DRIFTED_YML });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const violations = checkPnpmDrift(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].file, /test\.yml$/);
  assert.equal(violations[0].found, "9");
  assert.equal(violations[0].expected, "11.5.1");
});

test("checkPnpmDrift is clean when workflow version matches packageManager", (t) => {
  const root = makeTempRepo({ pkgVersion: "11.5.1", githubYml: CLEAN_YML, giteaYml: CLEAN_YML });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(checkPnpmDrift(root), []);
});

test("checkGithubPushToMain flags a push to main inside .github/workflows", (t) => {
  const root = makeTempRepo({ githubYml: GITHUB_PUSH_YML });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const violations = checkGithubPushToMain(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].file, /\.github\/workflows\/test\.yml$/);
});

test("checkGithubPushToMain does NOT flag the same push inside .gitea/workflows (ADR-002: Gitea is authoritative)", (t) => {
  const root = makeTempRepo({ giteaYml: GITHUB_PUSH_YML });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(checkGithubPushToMain(root), []);
});

test("runChecks reports both violation kinds together", (t) => {
  const root = makeTempRepo({
    pkgVersion: "11.5.1",
    githubYml: `
name: broken
jobs:
  build:
    steps:
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - run: git push origin main
`,
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const violations = runChecks(root);
  assert.equal(violations.length, 2);
  const kinds = violations.map((v) => v.kind).sort();
  assert.deepEqual(kinds, ["pnpm-drift", "push-to-main"]);
});

test("CLI exits 1 and reports the drift when a workflow disagrees with packageManager", (t) => {
  const root = makeTempRepo({ pkgVersion: "11.5.1", githubYml: DRIFTED_YML });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = runCli(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /pnpm-drift/);
  assert.match(result.stdout, /9/);
  assert.match(result.stdout, /11\.5\.1/);
});

test("CLI exits 1 and reports a GitHub push-to-main violation", (t) => {
  const root = makeTempRepo({ githubYml: GITHUB_PUSH_YML });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = runCli(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /push-to-main/);
});

test("CLI exits 0 on a clean repo (matching pnpm version, no GitHub push-to-main)", (t) => {
  const root = makeTempRepo({ pkgVersion: "11.5.1", githubYml: CLEAN_YML, giteaYml: GITHUB_PUSH_YML });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = runCli(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("the real repo currently passes the ci-policy gate", () => {
  // Sanity guard: runs the checker against the ACTUAL repo (read-only,
  // no writes) to confirm today's .github/ and .gitea/ workflows are clean.
  const violations = runChecks(REPO_ROOT);
  assert.deepEqual(violations, []);
});

test("CLI works against a full copy of the real repo's workflow files", (t) => {
  // Belt-and-braces: exercise the CLI (not just the imported functions)
  // against a real copy of package.json + .github + .gitea, matching the
  // makeTempRepoCopy pattern used by locale-sync.test.mjs.
  const root = mkdtempSync(path.join(tmpdir(), "ci-policy-real-copy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  cpSync(path.join(REPO_ROOT, "package.json"), path.join(root, "package.json"));
  cpSync(path.join(REPO_ROOT, ".github"), path.join(root, ".github"), { recursive: true });
  cpSync(path.join(REPO_ROOT, ".gitea"), path.join(root, ".gitea"), { recursive: true });

  const result = runCli(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
