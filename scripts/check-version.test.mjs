import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

describe('check-version', () => {
  // Helper: parse TOML version
  function getTomlVersion(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^version\s*=\s*"([^"]+)"/m);
    return match ? match[1] : null;
  }

  // Helper: parse package.json version
  function getPackageJsonVersion() {
    const pkgPath = path.join(rootDir, 'package.json');
    const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return content.version;
  }

  // Helper: get latest Git tag (v-prefixed or unprefixed)
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

  // Helper: parse version from tag (strip v prefix)
  function versionFromTag(tag) {
    return tag?.replace(/^v/, '') || null;
  }

  it('should verify workspace version in rust/Cargo.toml', () => {
    const workspacePath = path.join(rootDir, 'rust', 'Cargo.toml');
    const version = getTomlVersion(workspacePath);
    expect(version).toBeTruthy();
    expect(/^\d+\.\d+\.\d+$/.test(version)).toBe(true);
  });

  it('should verify all crates use version.workspace = true', () => {
    const crates = ['protocol', 'engine', 'server'];
    const workspaceVersion = getTomlVersion(
      path.join(rootDir, 'rust', 'Cargo.toml')
    );

    for (const crate of crates) {
      const cratePath = path.join(rootDir, 'rust', crate, 'Cargo.toml');
      const content = fs.readFileSync(cratePath, 'utf-8');

      // Check for version.workspace = true
      const hasWorkspaceVersion = /^version\.workspace\s*=\s*true/m.test(
        content
      );
      expect(hasWorkspaceVersion).toBe(true);

      // Ensure no duplicate hardcoded version
      const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m);
      expect(versionMatch).toBeNull();
    }
  });

  it('should verify package.json version matches workspace version', () => {
    const workspaceVersion = getTomlVersion(
      path.join(rootDir, 'rust', 'Cargo.toml')
    );
    const packageVersion = getPackageJsonVersion();
    expect(packageVersion).toBe(workspaceVersion);
  });

  it('should detect version mismatches between manifests', () => {
    const workspaceVersion = getTomlVersion(
      path.join(rootDir, 'rust', 'Cargo.toml')
    );
    const packageVersion = getPackageJsonVersion();
    const crates = ['protocol', 'engine', 'server'];

    // All should match workspace version
    expect(packageVersion).toBe(workspaceVersion);
    for (const crate of crates) {
      const cratePath = path.join(rootDir, 'rust', crate, 'Cargo.toml');
      const content = fs.readFileSync(cratePath, 'utf-8');
      const isWorkspaceVersion = /^version\.workspace\s*=\s*true/m.test(
        content
      );
      expect(isWorkspaceVersion).toBe(true);
    }
  });

  it('should allow tag to be older than manifest version (not-yet-released scenario)', () => {
    const tag = getLatestTag();
    if (!tag) {
      // No tags yet, that's OK
      expect(true).toBe(true);
      return;
    }

    const workspaceVersion = getTomlVersion(
      path.join(rootDir, 'rust', 'Cargo.toml')
    );
    const tagVersion = versionFromTag(tag);

    // Tag can be older (not released yet), but not newer
    if (tagVersion && /^\d+\.\d+\.\d+$/.test(tagVersion)) {
      // Just verify semver format; no error if tag is older
      expect(/^\d+\.\d+\.\d+$/.test(workspaceVersion)).toBe(true);
    }
  });

  it('should reject if tag version is newer than manifest version', () => {
    // This test verifies the error case: we DO have a tag that's newer
    // We'll skip this in the normal run and only test it with a contrived scenario
    const tag = getLatestTag();
    const workspaceVersion = getTomlVersion(
      path.join(rootDir, 'rust', 'Cargo.toml')
    );
    const tagVersion = versionFromTag(tag);

    // In the normal case, tag should not be newer
    if (tagVersion && /^\d+\.\d+\.\d+$/.test(tagVersion)) {
      const [tMajor, tMinor, tPatch] = tagVersion.split('.').map(Number);
      const [mMajor, mMinor, mPatch] = workspaceVersion
        .split('.')
        .map(Number);

      // Tag must not be newer
      const tagNewer =
        tMajor > mMajor ||
        (tMajor === mMajor && tMinor > mMinor) ||
        (tMajor === mMajor && tMinor === mMinor && tPatch > mPatch);
      expect(tagNewer).toBe(false);
    }
  });
});
