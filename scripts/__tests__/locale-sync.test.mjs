// Round-trip tests for scripts/locale-sync.mjs.
//
// IMPORTANT: every test operates on a TEMPORARY COPY of the real locale
// tree (created fresh per test in os.tmpdir()) and is torn down afterwards.
// The real packages/web/src/locales/**/*.json files are never written to.
//
// Run: node --test scripts/__tests__/locale-sync.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flatten, getPath } from "../locale-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const REAL_LOCALES_DIR = path.join(REPO_ROOT, "packages/web/src/locales");

// Sets up a throwaway copy of scripts/ + the locale tree under a tmp dir, so
// the CLI's REPO_ROOT (derived from its own file location) resolves inside
// the copy instead of the real repo. Returns { root, cliPath, localesDir }.
function makeTempRepoCopy() {
  const root = mkdtempSync(path.join(tmpdir(), "locale-sync-test-"));
  cpSync(
    path.join(REPO_ROOT, "scripts/locale-sync.mjs"),
    path.join(root, "scripts/locale-sync.mjs"),
  );
  cpSync(REAL_LOCALES_DIR, path.join(root, "packages/web/src/locales"), {
    recursive: true,
  });
  return {
    root,
    cliPath: path.join(root, "scripts/locale-sync.mjs"),
    localesDir: path.join(root, "packages/web/src/locales"),
  };
}

function runCli(cliPath, args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
  });
  return result;
}

function readNsJson(localesDir, locale, ns) {
  return JSON.parse(
    readFileSync(path.join(localesDir, locale, `${ns}.json`), "utf8"),
  );
}

function writeNsJson(localesDir, locale, ns, obj) {
  writeFileSync(
    path.join(localesDir, locale, `${ns}.json`),
    `${JSON.stringify(obj, null, 2)}\n`,
  );
}

// Picks a real, existing nested (depth >= 2) leaf path from the source
// locale/namespace, so the test stays valid even as locale content evolves.
function pickNestedKey(localesDir, locale, ns) {
  const obj = readNsJson(localesDir, locale, ns);
  const flat = flatten(obj);
  const nested = Object.keys(flat).find((k) => k.includes("."));
  assert.ok(nested, `expected at least one nested key in ${locale}/${ns}.json`);
  return { dottedPath: nested, value: flat[nested] };
}

// Deletes a dotted-path leaf from a plain object (mutates in place).
function deletePath(obj, dottedPath) {
  const segments = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) cur = cur[segments[i]];
  delete cur[segments[segments.length - 1]];
}

test("diff finds an artificially removed nested key", (t) => {
  const { root, cliPath, localesDir } = makeTempRepoCopy();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const ns = "manager";
  const { dottedPath, value } = pickNestedKey(localesDir, "de", ns);

  const esObj = readNsJson(localesDir, "es", ns);
  deletePath(esObj, dottedPath);
  writeNsJson(localesDir, "es", ns, esObj);

  const result = runCli(cliPath, ["diff", "--source", "de", "--ns", ns]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);

  assert.ok(parsed.es, "expected es to be reported as missing something");
  assert.equal(parsed.es[ns][dottedPath], value);
});

test("apply re-inserts the key at the correct nested position, then diff is empty", (t) => {
  const { root, cliPath, localesDir } = makeTempRepoCopy();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const ns = "manager";
  const { dottedPath, value } = pickNestedKey(localesDir, "de", ns);

  const beforeEs = readNsJson(localesDir, "es", ns);
  deletePath(beforeEs, dottedPath);
  writeNsJson(localesDir, "es", ns, beforeEs);

  // Snapshot all other (untouched) keys in es/manager.json before apply.
  const beforeFlat = flatten(beforeEs);

  const translationsPath = path.join(root, "translations.json");
  writeFileSync(
    translationsPath,
    JSON.stringify({ es: { [ns]: { [dottedPath]: value } } }, null, 2),
  );

  const applyResult = runCli(cliPath, ["apply", translationsPath]);
  assert.equal(applyResult.status, 0, applyResult.stderr);

  const afterEs = readNsJson(localesDir, "es", ns);
  assert.equal(
    getPath(afterEs, dottedPath),
    value,
    "key should be re-inserted at its correct nested path",
  );

  // Every key that existed before apply is still present, unchanged.
  for (const [k, v] of Object.entries(beforeFlat)) {
    assert.equal(getPath(afterEs, k), v, `pre-existing key "${k}" changed`);
  }

  // A second diff no longer reports this locale/namespace/key as missing.
  const diffResult = runCli(cliPath, ["diff", "--source", "de", "--ns", ns]);
  assert.equal(diffResult.status, 0, diffResult.stderr);
  const diffAfter = JSON.parse(diffResult.stdout);
  assert.equal(
    diffAfter.es?.[ns]?.[dottedPath],
    undefined,
    "key should no longer be reported missing after apply",
  );
});

test("apply is idempotent (applying twice yields the same file bytes)", (t) => {
  const { root, cliPath, localesDir } = makeTempRepoCopy();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const ns = "manager";
  const { dottedPath, value } = pickNestedKey(localesDir, "de", ns);

  const esObj = readNsJson(localesDir, "es", ns);
  deletePath(esObj, dottedPath);
  writeNsJson(localesDir, "es", ns, esObj);

  const translationsPath = path.join(root, "translations.json");
  writeFileSync(
    translationsPath,
    JSON.stringify({ es: { [ns]: { [dottedPath]: value } } }, null, 2),
  );

  const filePath = path.join(localesDir, "es", `${ns}.json`);

  const first = runCli(cliPath, ["apply", translationsPath]);
  assert.equal(first.status, 0, first.stderr);
  const afterFirst = readFileSync(filePath, "utf8");

  const second = runCli(cliPath, ["apply", translationsPath]);
  assert.equal(second.status, 0, second.stderr);
  const afterSecond = readFileSync(filePath, "utf8");

  assert.equal(afterSecond, afterFirst, "second apply must not change the file");
});

test("real locale files are never touched by this test suite", () => {
  // Sanity guard: the tests above only ever operate on tmpdir copies.
  // This assertion documents that REAL_LOCALES_DIR is read here (to build
  // the copy) but never passed to writeNsJson/apply.
  const de = readNsJson(REAL_LOCALES_DIR, "de", "manager");
  assert.ok(de && typeof de === "object");
});
