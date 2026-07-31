#!/usr/bin/env node
/**
 * generate-manifest.mjs
 *
 * Walks packages/web/src/assets/experiences/flower-battle/optimized/fixed/,
 * computes a SHA-256 for every .svg file, resolves a canonical Razzoozle-internal
 * alias (bg_sky_day -> sky-day.svg, etc.) and writes a deterministic JSON manifest
 * to garden-asset-manifest.json (next to the source SVG folder).
 *
 * License is CC0 for every asset (all assets in this folder are self-generated
 * for the Blüten-Battle presenter); the only exceptions are the legacy entries
 * the script inherits from LICENSE-SOURCES.md (none in this first batch).
 *
 * Run via: pnpm --filter @razzoozle/web garden:manifest
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXED_DIR = resolve(__dirname, "../optimized/fixed");
const OUTPUT = resolve(__dirname, "../garden-asset-manifest.json");

/**
 * Canonical alias map: alias -> file basename.
 * The alias name MUST remain stable across releases (consumed by Pixi bundle
 * and GardenScene layers in WP-PRESENTER-2/3). Keep this map in sync with
 * LICENSE-SOURCES.md.
 */
const ALIAS_MAP = Object.freeze({
  bg_sky_day: "sky-day.svg",
  bg_cloud_01: "cloud-soft-01.svg",
  bg_cloud_02: "cloud-soft-02.svg",
  bg_cloud_03: "cloud-soft-03.svg",
  bg_sun_glow: "sun-glow.svg",
  bg_hill_back_01: "distant-hills-01.svg",
  bg_bush_back_01: "distant-bushes-01.svg",
  bg_tree_mid_01: "mid-trees-01.svg",
  env_fence_white: "fence-white-01.svg",
  env_grass_base: "lawn-01.svg",
  env_grass_detail_01: "lawn-detail-grass-tufts-01.svg",
  env_soil_plot_01: "soil-plot-team-01.svg",
  env_foreground_leaf_left: "foreground-leaf-left.svg",
  env_foreground_leaf_right: "foreground-leaf-right.svg",
  env_foreground_bush_01: "foreground-bush-01.svg",
});

const ABFRUFDATUM = "2026-07-31";
const LICENSE = "CC0 (Razzoozle-internal, self-generated)";
const STATUS = "Imported";

async function sha256OfFile(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Pretty-print viewBox/dimensions from the SVG <svg viewBox="..."> root tag.
 * Returns { width, height, viewBox } or null if not parseable.
 */
function extractSvgGeometry(svgText) {
  const m = svgText.match(/<svg\b[^>]*\bviewBox="([^"]+)"/i);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [, , w, h] = parts;
  return { viewBox: m[1], width: w, height: h };
}

async function main() {
  const entries = await readdir(FIXED_DIR, { withFileTypes: true });
  const svgFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".svg"))
    .map((e) => e.name)
    .sort();

  const assets = [];
  const errors = [];

  for (const filename of svgFiles) {
    const fullPath = join(FIXED_DIR, filename);
    const statInfo = await stat(fullPath);
    const sha256 = await sha256OfFile(fullPath);
    const text = await readFile(fullPath, "utf8");
    const geometry = extractSvgGeometry(text);

    // Determine alias if any (reverse lookup)
    let alias = null;
    for (const [a, f] of Object.entries(ALIAS_MAP)) {
      if (f === filename) {
        alias = a;
        break;
      }
    }

    assets.push({
      file: filename,
      alias,
      sha256,
      license: LICENSE,
      abrufdatum: ABFRUFDATUM,
      status: STATUS,
      bytes: statInfo.size,
      geometry,
    });

    if (!alias) {
      errors.push(`no alias mapping for ${filename}`);
    }
  }

  // Sort assets by alias (stable order for diffs), then by file name.
  assets.sort((a, b) => {
    const ak = a.alias ?? `zzz:${a.file}`;
    const bk = b.alias ?? `zzz:${b.file}`;
    if (ak < bk) return -1;
    if (ak > bk) return 1;
    return 0;
  });

  const manifest = {
    $schema: "./garden-asset-manifest.schema.json",
    generated_at: new Date().toISOString(),
    generator: "generate-manifest.mjs",
    fixed_dir: FIXED_DIR,
    abrufdatum: ABFRUFDATUM,
    asset_count: assets.length,
    alias_count: Object.values(ALIAS_MAP).length,
    aliases: Object.fromEntries(
      Object.entries(ALIAS_MAP).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    assets,
  };

  await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    `[garden-manifest] wrote ${basename(OUTPUT)} (${assets.length} assets, ${manifest.alias_count} aliases)`,
  );
  if (errors.length) {
    console.warn(
      `[garden-manifest] WARNING ${errors.length} file(s) without alias mapping:`,
    );
    for (const e of errors) console.warn(`  - ${e}`);
    // Non-fatal: unaliased assets still appear in the manifest.
  }
}

main().catch((err) => {
  console.error("[garden-manifest] FATAL:", err);
  process.exit(1);
});