import { createHash } from "node:crypto"
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

import { describe, expect, it } from "vitest"

const ASSET_ROOT = fileURLToPath(
  new URL("../../../../assets/experiences/flower-battle/", import.meta.url),
)
const DERIVE_SCRIPT = join(ASSET_ROOT, "scripts/derive-fluent-plants.mjs")
const COMMITTED_ROOT = join(ASSET_ROOT, "optimized/plants")

const PLANT_FILES = [
  "shared/seedling.svg",
  "shared/sprout.svg",
  "shared/pot.svg",
  "violet-hibiscus/bud.svg",
  "violet-hibiscus/half-bloom.svg",
  "violet-hibiscus/full-bloom.svg",
  "blue-tulip/bud.svg",
  "blue-tulip/half-bloom.svg",
  "blue-tulip/full-bloom.svg",
  "orange-sunflower/bud.svg",
  "orange-sunflower/half-bloom.svg",
  "orange-sunflower/full-bloom.svg",
  "green-blossom/bud.svg",
  "green-blossom/half-bloom.svg",
  "green-blossom/full-bloom.svg",
] as const

const FULL_BLOOM_SCALES = {
  "violet-hibiscus/full-bloom.svg": "0.520",
  "blue-tulip/full-bloom.svg": "0.780",
  "orange-sunflower/full-bloom.svg": "0.800",
  "green-blossom/full-bloom.svg": "0.780",
} as const

const SPECIES_DIRS = [
  "violet-hibiscus",
  "blue-tulip",
  "orange-sunflower",
  "green-blossom",
] as const

const STAGE_FILES = ["bud", "half-bloom", "full-bloom"] as const

function readPlants(root: string) {
  const out: Record<string, string> = {}
  for (const file of PLANT_FILES) {
    const abs = join(root, file)
    if (!existsSync(abs)) continue
    out[file] = readFileSync(abs, "utf8")
  }
  return out
}

function derivePlants(root: string) {
  const script = join(root, "scripts/derive-fluent-plants.mjs")
  mkdirSync(dirname(script), { recursive: true })
  copyFileSync(DERIVE_SCRIPT, script)
  cpSync(join(ASSET_ROOT, "source"), join(root, "source"), {
    recursive: true,
  })
  execFileSync(process.execPath, [script])
  return readPlants(join(root, "optimized/plants"))
}

function hashPlants(plants: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(plants).map(([file, svg]) => [
      file,
      createHash("sha256").update(svg).digest("hex"),
    ]),
  )
}

function rootOpenTag(svg: string): string {
  const match = /<svg\b[^>]*>/.exec(svg)
  return match ? match[0] : ""
}

function readDataAttr(openTag: string, name: string): string | null {
  const re = new RegExp(`\\bdata-${name}="([^"]*)"`)
  const match = re.exec(openTag)
  return match ? match[1] : null
}

function parseNumericPair(value: string): { x: number; y: number } | null {
  const parts = value.split(",").map((v) => Number.parseFloat(v.trim()))
  if (parts.length !== 2) return null
  const [x, y] = parts
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

describe("derived Fluent plant assets", () => {
  it("stay deterministic, transparent by default, and size calibrated blooms", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "razzoozle-fluent-plants-"))

    try {
      const firstRun = derivePlants(join(tempRoot, "layout-a"))
      const secondRun = derivePlants(join(tempRoot, "layout-b"))
      const committed = readPlants(COMMITTED_ROOT)

      expect(hashPlants(secondRun)).toEqual(hashPlants(firstRun))
      expect(committed).toEqual(firstRun)
      expect(Object.keys(committed)).toHaveLength(15)

      for (const [file, svg] of Object.entries(committed)) {
        expect(svg, file).toMatch(/^<svg\b[^>]*\bfill="none"/)
      }

      for (const [file, scale] of Object.entries(FULL_BLOOM_SCALES)) {
        expect(committed[file], file).toContain(`scale(${scale})`)
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it("omits the synthetic face signature and eye/mouth group from every full-bloom", () => {
    const committed = readPlants(COMMITTED_ROOT)
    const fullBloomFiles = PLANT_FILES.filter((f) =>
      f.endsWith("/full-bloom.svg"),
    )
    expect(fullBloomFiles.length).toBe(SPECIES_DIRS.length)

    for (const file of fullBloomFiles) {
      const svg = committed[file]
      expect(
        svg,
        `${file}: face hex #2B2118 leaked into full-bloom`,
      ).not.toMatch(/#2B2118/i)
      expect(
        svg,
        `${file}: injected eye/mouth group with FACE_FILL present`,
      ).not.toMatch(/<g\b[^>]*\bfill="#2B2118"/i)
    }
  })

  it("emits shared/pot.svg in the deterministic output list with stable SVG-only metadata", () => {
    const committed = readPlants(COMMITTED_ROOT)
    const files = Object.keys(committed)

    expect(files).toContain("shared/pot.svg")
    expect(files).toHaveLength(15)
    expect(new Set(files).size).toBe(15)

    const pot = committed["shared/pot.svg"]
    expect(pot, "shared/pot.svg must be SVG, not raster").toMatch(/^<svg\b/)
    expect(pot, "shared/pot.svg must not embed <image> elements").not.toMatch(
      /<image\b/i,
    )
    expect(
      pot,
      "shared/pot.svg must not embed raster via data: URIs",
    ).not.toMatch(/data:image\/(png|jpe?g|gif|webp|bmp)/i)
    expect(
      pot,
      "shared/pot.svg must expose stable pot diagnostic metadata on root",
    ).toMatch(/\bdata-fb-pot-version="[^"]+"/)
  })

  it("exposes explicit numeric attachment diagnostics on root for every bud/half/full", () => {
    const committed = readPlants(COMMITTED_ROOT)
    for (const dir of SPECIES_DIRS) {
      for (const stage of STAGE_FILES) {
        const file = `${dir}/${stage}.svg`
        const svg = committed[file]
        const open = rootOpenTag(svg)
        expect(open, `${file}: <svg> root open tag missing`).not.toBe("")

        const stageAttr = readDataAttr(open, "fb-stage")
        expect(
          stageAttr,
          `${file}: data-fb-stage missing on root`,
        ).not.toBeNull()
        expect(
          stageAttr,
          `${file}: data-fb-stage not "bud"|"half"|"full"`,
        ).toMatch(/^(bud|half|full)$/)

        const stemTipRaw = readDataAttr(open, "fb-stem-tip")
        expect(
          stemTipRaw,
          `${file}: data-fb-stem-tip missing on root`,
        ).not.toBeNull()
        expect(
          parseNumericPair(stemTipRaw ?? ""),
          `${file}: data-fb-stem-tip must be numeric "x,y"`,
        ).not.toBeNull()

        const bloomBaseRaw = readDataAttr(open, "fb-bloom-base")
        expect(
          bloomBaseRaw,
          `${file}: data-fb-bloom-base missing on root`,
        ).not.toBeNull()
        expect(
          parseNumericPair(bloomBaseRaw ?? ""),
          `${file}: data-fb-bloom-base must be numeric "x,y"`,
        ).not.toBeNull()

        const overlapRaw = readDataAttr(open, "fb-overlap")
        expect(
          overlapRaw,
          `${file}: data-fb-overlap missing on root`,
        ).not.toBeNull()
        const overlap = Number.parseFloat(overlapRaw ?? "")
        expect(
          Number.isFinite(overlap),
          `${file}: data-fb-overlap must be numeric`,
        ).toBe(true)
      }
    }
  })

  it("keeps non-negative >=0.5 overlap at the stable attachment line for stages 5/8/10", () => {
    const committed = readPlants(COMMITTED_ROOT)
    const stemTops: Record<(typeof SPECIES_DIRS)[number], number> = {
      "violet-hibiscus": 19.66,
      "blue-tulip": 19.66,
      "orange-sunflower": 19.75,
      "green-blossom": 19.64,
    }

    for (const dir of SPECIES_DIRS) {
      for (const stage of STAGE_FILES) {
        const file = `${dir}/${stage}.svg`
        const svg = committed[file]
        const open = rootOpenTag(svg)
        const stemTipRaw = readDataAttr(open, "fb-stem-tip")
        const bloomBaseRaw = readDataAttr(open, "fb-bloom-base")
        const overlapRaw = readDataAttr(open, "fb-overlap")
        const stemTip = parseNumericPair(stemTipRaw ?? "")
        const bloomBase = parseNumericPair(bloomBaseRaw ?? "")
        const overlap = Number.parseFloat(overlapRaw ?? "")

        expect(
          stemTip !== null && bloomBase !== null && Number.isFinite(overlap),
          `${file}: attachment diagnostics must be present and numeric`,
        ).toBe(true)
        if (!stemTip || !bloomBase) continue

        const attachmentLine = stemTops[dir]
        const stemTipDelta = Math.abs(stemTip.y - attachmentLine)
        const bloomBaseDelta = Math.abs(bloomBase.y - attachmentLine)
        expect(
          stemTipDelta,
          `${file}: stem tip y=${stemTip.y} not on stable attachment line y=${attachmentLine}`,
        ).toBeLessThan(0.01)
        expect(
          bloomBaseDelta,
          `${file}: bloom base y=${bloomBase.y} not on stable attachment line y=${attachmentLine}`,
        ).toBeLessThan(0.01)
        expect(
          overlap,
          `${file}: overlap must be non-negative`,
        ).toBeGreaterThanOrEqual(0)
        expect(
          overlap,
          `${file}: overlap must be >=0.5 logical SVG units`,
        ).toBeGreaterThanOrEqual(0.5)
      }
    }
  })
})
