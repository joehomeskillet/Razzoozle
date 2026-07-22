#!/usr/bin/env node
// locale-sync — deterministic CLI for the web locale JSON tree.
//
// Root: packages/web/src/locales/<locale>/<namespace>.json
//
// This tool does ALL structural JSON handling itself (read/parse/merge/write,
// stable ordering, indentation). It never asks an LLM to touch JSON directly —
// agents only ever provide translated STRING VALUES via the `apply` input
// file. See docs/agents/locale-sync.md for the intended agent workflow.
//
// Subcommands:
//   diff  [--source <loc>] [--ns <namespace>]
//   apply <translations.json>
//   check
//
// Run with --help for usage.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(
  REPO_ROOT,
  "packages/web/src/locales",
);

function listLocales() {
  return readdirSync(LOCALES_DIR)
    .filter((name) => statSync(path.join(LOCALES_DIR, name)).isDirectory())
    .sort();
}

function listNamespaces(locale) {
  return readdirSync(path.join(LOCALES_DIR, locale))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

function nsFilePath(locale, ns) {
  return path.join(LOCALES_DIR, locale, `${ns}.json`);
}

function validateNsKey(ns) {
  if (!/^[a-z0-9_-]+$/.test(ns)) {
    throw new Error(
      `invalid namespace key "${ns}" — must match /^[a-z0-9_-]+$/`,
    );
  }
}

function readJson(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

// Recursively flattens a nested object into { "dotted.path": leafValue }.
// Arrays and primitives are treated as leaves (never recursed into).
function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const dottedPath = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      flatten(value, dottedPath, out);
    } else {
      out[dottedPath] = value;
    }
  }
  return out;
}

// Reads a dotted path out of a nested object. Returns undefined if any
// intermediate segment is missing.
function getPath(obj, dottedPath) {
  const segments = dottedPath.split(".");
  let cur = obj;
  for (const segment of segments) {
    if (!isPlainObject(cur) || !(segment in cur)) return undefined;
    cur = cur[segment];
  }
  return cur;
}

// Writes a value at a dotted path into a nested object, creating missing
// intermediate objects as needed. New keys are appended to whatever object
// they land in (JS objects preserve insertion order), so existing keys and
// their relative order are never disturbed. Sibling insertion order among
// newly-added keys follows the iteration order of `entries` (which mirrors
// the source's own key order, since `diff` walks the source recursively).
function setPath(obj, dottedPath, value) {
  const segments = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!isPlainObject(cur[segment])) {
      cur[segment] = {};
    }
    cur = cur[segment];
  }
  cur[segments[segments.length - 1]] = value;
}

function writeJson(filePath, obj) {
  writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

// Deletes a dotted-path leaf from a nested object, if present. Returns
// whether anything was actually removed (false for already-absent paths).
// Never touches sibling keys. Parent objects left empty by the deletion are
// pruned separately via pruneEmpty (see cmdRemove).
function deletePath(obj, dottedPath) {
  const segments = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!isPlainObject(cur[segment])) return false;
    cur = cur[segment];
  }
  const last = segments[segments.length - 1];
  if (!(last in cur)) return false;
  delete cur[last];
  return true;
}

// Recursively removes now-empty plain-object containers (post `remove`), so
// deleting the last key of e.g. "plugins.title" doesn't leave "plugins": {}
// litter behind. Never touches non-empty objects, arrays, or primitives.
function pruneEmpty(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (isPlainObject(value)) {
      pruneEmpty(value);
      if (Object.keys(value).length === 0) delete obj[key];
    }
  }
}

// Computes, per target locale/namespace, the deeply-missing leaf keys
// relative to `sourceLocale`. Returns { [loc]: { [ns]: { path: value } } },
// omitting empty entries.
function computeDiff(sourceLocale, nsFilter) {
  const locales = listLocales();
  if (!locales.includes(sourceLocale)) {
    throw new Error(
      `unknown source locale "${sourceLocale}" (known: ${locales.join(", ")})`,
    );
  }
  const namespaces = nsFilter ? [nsFilter] : listNamespaces(sourceLocale);

  const result = {};
  for (const locale of locales) {
    if (locale === sourceLocale) continue;
    const nsResult = {};
    for (const ns of namespaces) {
      const sourcePath = nsFilePath(sourceLocale, ns);
      const targetPath = nsFilePath(locale, ns);
      let sourceObj;
      try {
        sourceObj = readJson(sourcePath);
      } catch (err) {
        throw new Error(`cannot read/parse source ${sourcePath}: ${err.message}`);
      }
      let targetObj = {};
      try {
        targetObj = readJson(targetPath);
      } catch {
        // Missing/invalid target namespace file: everything is missing.
        targetObj = {};
      }

      const sourceFlat = flatten(sourceObj);
      const missing = {};
      for (const [dottedPath, value] of Object.entries(sourceFlat)) {
        if (getPath(targetObj, dottedPath) === undefined) {
          missing[dottedPath] = value;
        }
      }
      if (Object.keys(missing).length > 0) {
        nsResult[ns] = missing;
      }
    }
    if (Object.keys(nsResult).length > 0) {
      result[locale] = nsResult;
    }
  }
  return result;
}

// Deep key-parity report across ALL locales (pairwise vs. union of all keys
// seen for that namespace). Returns { [ns]: { [loc]: [dottedPath, ...] } }.
function computeCheck() {
  const locales = listLocales();
  const namespacesUnion = new Set();
  for (const locale of locales) {
    for (const ns of listNamespaces(locale)) namespacesUnion.add(ns);
  }

  const report = {};
  let invalid = false;
  for (const ns of [...namespacesUnion].sort()) {
    const flatByLocale = {};
    for (const locale of locales) {
      const filePath = nsFilePath(locale, ns);
      try {
        flatByLocale[locale] = flatten(readJson(filePath));
      } catch (err) {
        console.error(`INVALID JSON: ${filePath}: ${err.message}`);
        invalid = true;
      }
    }
    const allKeys = new Set();
    for (const flat of Object.values(flatByLocale)) {
      for (const key of Object.keys(flat)) allKeys.add(key);
    }
    const nsReport = {};
    for (const locale of locales) {
      const flat = flatByLocale[locale] ?? {};
      const missing = [...allKeys].filter((k) => !(k in flat)).sort();
      if (missing.length > 0) nsReport[locale] = missing;
    }
    if (Object.keys(nsReport).length > 0) report[ns] = nsReport;
  }
  if (invalid) {
    const err = new Error("invalid JSON encountered during check");
    err.invalid = true;
    throw err;
  }
  return report;
}

function cmdDiff(args) {
  let source = "de";
  let ns = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source") source = args[++i];
    else if (args[i] === "--ns") ns = args[++i];
    else {
      console.error(`diff: unknown argument "${args[i]}"`);
      process.exit(1);
    }
  }
  const result = computeDiff(source, ns);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function cmdApply(args) {
  const [translationsPath] = args;
  if (!translationsPath) {
    console.error("apply: missing <translations.json> argument");
    process.exit(1);
  }
  let translations;
  try {
    translations = JSON.parse(readFileSync(translationsPath, "utf8"));
  } catch (err) {
    console.error(`apply: cannot read/parse "${translationsPath}": ${err.message}`);
    process.exit(1);
  }

  const knownLocales = new Set(listLocales());

  for (const [locale, nsMap] of Object.entries(translations)) {
    if (!knownLocales.has(locale)) {
      throw new Error(`unknown locale "${locale}"`);
    }
    const knownNamespaces = new Set(listNamespaces(locale));
    for (const [ns, entries] of Object.entries(nsMap)) {
      validateNsKey(ns);
      const filePath = nsFilePath(locale, ns);
      let targetObj;
      if (knownNamespaces.has(ns)) {
        try {
          targetObj = readJson(filePath);
        } catch (err) {
          console.error(`WARNING: cannot read "${filePath}", skipping: ${err.message}`);
          continue;
        }
      } else {
        console.error(`WARNING: unknown namespace "${ns}" for locale "${locale}", creating new file`);
        targetObj = {};
      }

      for (const [dottedPath, value] of Object.entries(entries)) {
        setPath(targetObj, dottedPath, value);
      }
      writeJson(filePath, targetObj);
    }
  }
}

// Removes dead keys from every locale for the given namespace(s). Input
// shape: { [namespace]: ["dotted.path", ...] }. Applied identically across
// ALL locales (a dead key is dead regardless of language). Missing paths
// are reported as WARNING and otherwise ignored (idempotent).
function cmdRemove(args) {
  const [deadKeysPath] = args;
  if (!deadKeysPath) {
    console.error("remove: missing <dead-keys.json> argument");
    process.exit(1);
  }
  let deadKeys;
  try {
    deadKeys = JSON.parse(readFileSync(deadKeysPath, "utf8"));
  } catch (err) {
    console.error(`remove: cannot read/parse "${deadKeysPath}": ${err.message}`);
    process.exit(1);
  }

  for (const locale of listLocales()) {
    const knownNamespaces = new Set(listNamespaces(locale));
    for (const [ns, paths] of Object.entries(deadKeys)) {
      validateNsKey(ns);
      if (!knownNamespaces.has(ns)) {
        console.error(`WARNING: skipping unknown namespace "${ns}" for locale "${locale}"`);
        continue;
      }
      const filePath = nsFilePath(locale, ns);
      const targetObj = readJson(filePath);
      let changed = false;
      for (const dottedPath of paths) {
        if (deletePath(targetObj, dottedPath)) {
          changed = true;
        } else {
          console.error(`WARNING: "${dottedPath}" not found in ${locale}/${ns}, skipping`);
        }
      }
      if (changed) {
        pruneEmpty(targetObj);
        writeJson(filePath, targetObj);
      }
    }
  }
}

function cmdCheck() {
  let report;
  try {
    report = computeCheck();
  } catch (err) {
    if (err.invalid) process.exit(1);
    throw err;
  }
  const namespaces = Object.keys(report).sort();
  if (namespaces.length === 0) {
    console.log("locale-sync check: all namespaces have full deep key parity across all locales.");
    return;
  }
  for (const ns of namespaces) {
    for (const [locale, missing] of Object.entries(report[ns])) {
      console.log(`WARN key-parity ${ns} [${locale}] missing: ${missing.join(", ")}`);
    }
  }
}

function printHelp() {
  console.log(`locale-sync — deterministic tooling for packages/web/src/locales/<loc>/<ns>.json

Usage:
  node scripts/locale-sync.mjs diff [--source <loc>] [--ns <namespace>]
      Prints JSON of deeply-missing keys per target locale/namespace, vs.
      --source (default: de). Read-only.

      Example:
        node scripts/locale-sync.mjs diff --source de --ns manager
        node scripts/locale-sync.mjs diff > /tmp/missing.json

  node scripts/locale-sync.mjs apply <translations.json>
      Reads a { locale: { namespace: { "dotted.key.path": "value" } } }
      file (same shape as \`diff\` output, but with translated values) and
      writes each value into the correct nested position of the target
      locale file. Preserves existing keys/order/indentation. Idempotent.

      Example:
        node scripts/locale-sync.mjs apply /tmp/translations.json

  node scripts/locale-sync.mjs check
      Deep (recursive, dotted-path) key-parity report across ALL locales
      and namespaces. Prints WARN lines for missing paths. Exit 0 unless
      a locale JSON file fails to parse (exit 1).

      Example:
        node scripts/locale-sync.mjs check

  node scripts/locale-sync.mjs remove <dead-keys.json>
      Reads a { namespace: ["dotted.key.path", ...] } file and deletes each
      path from that namespace in EVERY locale (a dead key is dead in every
      language). Missing paths are reported as WARNING and skipped.
      Idempotent.

      Example:
        node scripts/locale-sync.mjs remove /tmp/dead-keys.json
`);
}

function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(command ? 0 : 1);
  }
  switch (command) {
    case "diff":
      cmdDiff(rest);
      break;
    case "apply":
      cmdApply(rest);
      break;
    case "check":
      cmdCheck();
      break;
    case "remove":
      cmdRemove(rest);
      break;
    default:
      console.error(`unknown command "${command}"\n`);
      printHelp();
      process.exit(1);
  }
}

// Only run the CLI when this file is executed directly (not when imported,
// e.g. by scripts/__tests__/locale-sync.test.mjs, which reuses the pure
// helpers below for unit assertions).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { flatten, getPath, setPath, LOCALES_DIR, listLocales, listNamespaces };
