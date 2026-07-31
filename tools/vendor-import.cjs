#!/usr/bin/env node
/**
 * W10: Vendor-Importer für die im User-Prompt §5 aufgeführten Assets
 * (A01-A34). Liest manuell vom User akzeptierte Vendor-Pakete aus
 * `vendor-local/`, konvertiert sie zu optimierten SVGs in
 * `optimized/fixed/`.
 *
 * User-Prompt §5.3: KEINE Hotlinks, KEINE automatisierten Downloads.
 * User-Prompt §6: jeder Vendor-Import benötigt manuelle Lizenz-Akzept +
 * SHA-256-Attestation durch den User.
 *
 * Usage:
 *   1. User lädt Originale manuell herunter.
 *   2. User legt sie in `vendor-local/<asset-id>/` ab.
 *   3. User füllt `vendor-manifest.json` mit Quelle + Lizenz + SHA-256.
 *   4. `pnpm vendor:import` konvertiert und schreibt in `optimized/fixed/`.
 */

const { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } = require("node:fs")
const { join, dirname } = require("node:path")

const REPO_ROOT = join(__dirname, "..", "..")
const VENDOR_LOCAL = join(REPO_ROOT, "packages/web/src/assets/experiences/flower-battle/vendor-local")
const OPTIMIZED = join(REPO_ROOT, "packages/web/src/assets/experiences/flower-battle/optimized/fixed")
const VENDOR_MANIFEST = join(__dirname, "vendor-manifest.json")

const ASSET_MAPPING = {
  A08: { rename: "sky-day" },
  A07: { rename: "sun-glow" },
  A14: { rename: "sky-day-alt" },
  A09: { rename: "mid-trees" },
  A13: { rename: "distant-bushes" },
  A17: { rename: "fence-white" },
  A18: { rename: "lawn-detail" },
  A23: { rename: "foreground-leaf" },
  A34: { rename: "face-emotes" },
}

function cmdInit() {
  if (!existsSync(VENDOR_LOCAL)) {
    mkdirSync(VENDOR_LOCAL, { recursive: true })
  }
  writeFileSync(
    join(VENDOR_LOCAL, "README.md"),
    [
      "# Vendor-Local — manuell vom User akzeptierte Assets",
      "",
      "User-Prompt §5.3 verbietet Hotlinks. Diese Dateien sind manuell",
      "vom User herunterzuladen + mit Lizenz-Akzept zu versehen.",
      "",
      "## Verzeichnis-Konvention",
      "",
      "```",
      "vendor-local/",
      "  A08-background-elements/      # CC0 — kenney.nl/assets/background-elements",
      "    backgroundElements_0000.svg",
      "    backgroundElements_0001.svg",
      "    ...",
      "  A09-trees/                   # CC0 — wenrexa.itch.io/pack-natural-decoration-trees",
      "    tree_01.svg",
      "    ...",
      "```",
      "",
      "## Schritte",
      "",
      "1. Original-Asset-Pack herunterladen (Browser-Akzept nötig).",
      "2. In `vendor-local/<asset-id>/` entpacken (nur die benötigten SVGs).",
      "3. `tools/vendor-manifest.json` ausfüllen mit Quelle, Lizenz, SHA-256, Datum.",
      "4. `pnpm vendor:import` — schreibt nach `optimized/fixed/`.",
      "5. Optional: `pnpm vendor:list` zeigt den Status.",
      "",
      "## User-Prompt-§5.3-Verbot",
      "",
      "Hotlinks verboten. Automatisierte Downloads verboten. ZIP-Dateien",
      "nicht committen. `vendor-local/` ist vollständig gitignored.",
      "",
      "## Welche Assets herunterladen?",
      "",
      "User-Prompt §5.5 (Mapping Szenenbereich → Asset-Quelle):",
      "  Himmel/Wolken       → A08 (Background Elements) — kenney.nl",
      "  Sonne                → A07 (Noto Emoji) — github.com/googlefonts/noto-emoji",
      "  Ferne Büsche         → A09 (Trees) — wenrexa.itch.io",
      "  Midground            → A13 (Foliage) — opengameart.org/foliage-pack-100x",
      "  Weißer Zaun          → A17 (Market Tileset) — craftpix.net (lokal!)",
      "  Rasen                → A18 (Field Tileset) — craftpix.net (lokal!)",
      "  Vordergrund           → A23 (Foliage Sprites) — kenney.nl",
      "  Mimik                → A34 (Emotes Pack) — kenney.nl",
    ].join("\n") + "\n",
    "utf8",
  )
  writeFileSync(join(VENDOR_LOCAL, ".gitkeep"), "", "utf8")

  if (!existsSync(VENDOR_MANIFEST)) {
    const initial = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [
        // User-Prompt §6.1 Pflicht-Felder pro Asset:
        // { assetId: "A08", source: "https://kenney.nl/assets/background-elements",
        //   url: "<lokaler Pfad zur heruntergeladenen Datei>",
        //   license: "CC0-1.0", author: "Kenney",
        //   downloadedAt: "2026-07-31", sha256: "<sha256>",
        //   status: "pending", files: ["backgroundElements_0000.svg", "..."] },
      ],
    }
    writeFileSync(VENDOR_MANIFEST, JSON.stringify(initial, null, 2) + "\n", "utf8")
    console.log(`[init] ${VENDOR_MANIFEST} created with empty entries`)
  }
  console.log(`[init] ${VENDOR_LOCAL} initialized with README.md + .gitkeep`)
  console.log("[info] User must manually download + extract + fill vendor-manifest.json")
  return 0
}

function loadManifest() {
  if (!existsSync(VENDOR_MANIFEST)) {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] }
  }
  return JSON.parse(readFileSync(VENDOR_MANIFEST, "utf8"))
}

function importAsset(assetId, mapping) {
  const vendorDir = join(VENDOR_LOCAL, assetId)
  let ok = 0
  let fail = 0
  if (!existsSync(vendorDir)) {
    return { ok, fail }
  }
  const matched = readdirSync(vendorDir).filter((f) => f.endsWith(".svg"))
  for (const file of matched) {
    const src = join(vendorDir, file)
    try {
      const stats = statSync(src)
      if (stats.size > 1024 * 1024) {
        console.warn(`[skip] ${assetId}/${file}: > 1MB (${stats.size})`)
        fail++
        continue
      }
      const content = readFileSync(src, "utf8")
        .replace(/\t/g, "  ")
        .replace(/[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
      const targetName = file.startsWith(mapping.rename)
        ? file
        : `${mapping.rename}-${file}`
      const targetPath = join(OPTIMIZED, targetName)
      mkdirSync(dirname(targetPath), { recursive: true })
      writeFileSync(targetPath, content, "utf8")
      ok++
    } catch (err) {
      console.error(`[fail] ${assetId}/${file}: ${err.message}`)
      fail++
    }
  }
  return { ok, fail }
}

function cmdImport() {
  if (!existsSync(VENDOR_LOCAL)) {
    return cmdInit()
  }
  const manifest = loadManifest()
  let totalOk = 0
  let totalFail = 0
  for (const [assetId, mapping] of Object.entries(ASSET_MAPPING)) {
    const entry = manifest.entries.find((e) => e.assetId === assetId)
    if (!entry) {
      console.warn(`[skip] ${assetId}: not in vendor-manifest.json`)
      continue
    }
    if (entry.status !== "imported") {
      console.log(`[skip] ${assetId}: status=${entry.status}`)
      continue
    }
    const vendorDir = join(VENDOR_LOCAL, assetId)
    if (!existsSync(vendorDir)) {
      console.warn(`[skip] ${assetId}: vendor-local/${assetId}/ does not exist`)
      continue
    }
    const result = importAsset(assetId, mapping)
    totalOk += result.ok
    totalFail += result.fail
  }
  console.log(`[done] ${totalOk} files imported, ${totalFail} failed`)
  if (totalFail > 0) return 1
  return 0
}

function cmdList() {
  if (!existsSync(VENDOR_LOCAL)) {
    console.log("[empty] vendor-local/ does not exist")
    return 0
  }
  const manifest = loadManifest()
  console.log(`vendor-manifest.json: ${manifest.entries.length} entries`)
  for (const entry of manifest.entries) {
    const vendorDir = join(VENDOR_LOCAL, entry.assetId)
    const exists = existsSync(vendorDir)
    const status = exists ? entry.status : "missing-dir"
    console.log(`  ${entry.assetId} [${status}] ${entry.license} ${entry.source}`)
  }
  return 0
}

const cmd = process.argv[2] || "help"
let exitCode = 0
switch (cmd) {
  case "init":
    exitCode = cmdInit()
    break
  case "import":
    exitCode = cmdImport()
    break
  case "list":
    exitCode = cmdList()
    break
  case "help":
  default:
    console.log("Usage: tools/vendor-import.cjs [init|import|list]")
    console.log("  init   — create vendor-manifest.json + README + .gitkeep")
    console.log("  import — read vendor-local/ + write optimized/fixed/")
    console.log("  list   — show vendor-manifest status")
    break
}
process.exit(exitCode)
