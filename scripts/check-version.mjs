#!/usr/bin/env node

/**
 * check-version.mjs — Verify Razzoozle version consistency across manifests and tags.
 *
 * According to ADR-005:
 * - Workspace version (rust/Cargo.toml [workspace.package]) is canonical.
 * - All Rust crates must use version.workspace = true.
 * - package.json version must match workspace version.
 * - Git tags must be v-prefixed (v<MAJOR>.<MINOR>.<PATCH>).
 * - Tag version must not be newer than manifest version (older is OK, means not yet released).
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - Version mismatch or manifest inconsistency
 *   2 - Git tag newer than manifest (potential release process error)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

let hasErrors = false;
let hasWarnings = false;

// ANSI colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(level, msg) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  if (level === 'error') {
    console.log(`[${RED}ERROR${RESET}] [${timestamp}] ${msg}`);
  } else if (level === 'warn') {
    console.log(`[${YELLOW}WARN${RESET}] [${timestamp}] ${msg}`);
  } else if (level === 'ok') {
    console.log(`[${GREEN}OK${RESET}] [${timestamp}] ${msg}`);
  } else {
    console.log(`[INFO] [${timestamp}] ${msg}`);
  }
}

function getTomlVersion(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function getPackageJsonVersion() {
  const pkgPath = path.join(rootDir, 'package.json');
  const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return content.version;
}

function getLatestTag() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', {
      cwd: rootDir,
      encoding: 'utf-8',
    }).trim();
    return tag;
  } catch {
    return null;
  }
}

function versionFromTag(tag) {
  return tag?.replace(/^v/, '') || null;
}

function compareVersions(v1, v2) {
  // Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
  const [v1Maj, v1Min, v1Pat] = v1.split('.').map(Number);
  const [v2Maj, v2Min, v2Pat] = v2.split('.').map(Number);

  if (v1Maj !== v2Maj) return v1Maj > v2Maj ? 1 : -1;
  if (v1Min !== v2Min) return v1Min > v2Min ? 1 : -1;
  if (v1Pat !== v2Pat) return v1Pat > v2Pat ? 1 : -1;
  return 0;
}

// 1. Verify workspace version
log('info', 'Checking workspace version in rust/Cargo.toml...');
const workspacePath = path.join(rootDir, 'rust', 'Cargo.toml');
const workspaceVersion = getTomlVersion(workspacePath);

if (!workspaceVersion) {
  log('error', `Could not find workspace version in ${workspacePath}`);
  hasErrors = true;
} else if (!/^\d+\.\d+\.\d+$/.test(workspaceVersion)) {
  log('error', `Invalid version format: ${workspaceVersion} (expected X.Y.Z)`);
  hasErrors = true;
} else {
  log('ok', `Workspace version: ${workspaceVersion}`);
}

// 2. Verify all crates use version.workspace = true
log('info', 'Checking Rust crates...');
const crates = ['protocol', 'engine', 'server'];
for (const crate of crates) {
  const cratePath = path.join(rootDir, 'rust', crate, 'Cargo.toml');
  const content = fs.readFileSync(cratePath, 'utf-8');

  const hasWorkspaceVersion = /^version\.workspace\s*=\s*true/m.test(content);
  const hasHardcodedVersion = /^version\s*=\s*"([^"]+)"/m.test(content);

  if (!hasWorkspaceVersion) {
    log('error', `${crate}/Cargo.toml: missing "version.workspace = true"`);
    hasErrors = true;
  } else if (hasHardcodedVersion) {
    log('error', `${crate}/Cargo.toml: has duplicate hardcoded version (should be removed)`);
    hasErrors = true;
  } else {
    log('ok', `${crate}/Cargo.toml: version.workspace = true`);
  }
}

// 3. Verify package.json matches workspace
log('info', 'Checking package.json version...');
const packageVersion = getPackageJsonVersion();
if (packageVersion !== workspaceVersion) {
  log('error', `package.json version (${packageVersion}) does not match workspace (${workspaceVersion})`);
  hasErrors = true;
} else {
  log('ok', `package.json version: ${packageVersion}`);
}

// 4. Check latest git tag
log('info', 'Checking latest git tag...');
const latestTag = getLatestTag();
if (!latestTag) {
  log('warn', 'No git tags found (OK for initial release)');
} else {
  log('ok', `Latest tag: ${latestTag}`);

  const tagVersion = versionFromTag(latestTag);
  if (!tagVersion || !/^\d+\.\d+\.\d+$/.test(tagVersion)) {
    log('warn', `Latest tag has unusual format: ${latestTag} (parsed: ${tagVersion})`);
  } else {
    const cmp = compareVersions(tagVersion, workspaceVersion);
    if (cmp > 0) {
      log('error', `Tag version (${tagVersion}) is NEWER than workspace (${workspaceVersion})`);
      hasErrors = true;
    } else if (cmp < 0) {
      log('ok', `Tag version (${tagVersion}) is older than workspace (${workspaceVersion}) — not yet released`);
    } else {
      log('ok', `Tag version (${tagVersion}) matches workspace (${workspaceVersion})`);
    }
  }
}

// Summary
console.log('');
if (hasErrors) {
  log('error', 'Version checks FAILED');
  process.exit(1);
} else if (hasWarnings) {
  log('warn', 'Version checks passed with warnings');
  process.exit(0);
} else {
  log('ok', 'All version checks PASSED');
  process.exit(0);
}
