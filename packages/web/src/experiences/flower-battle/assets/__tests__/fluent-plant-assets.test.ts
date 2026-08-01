import { createHash } from "node:crypto"
import {
  copyFileSync,
  cpSync,
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

function readPlants(root: string) {
  return Object.fromEntries(
    PLANT_FILES.map((file) => [file, readFileSync(join(root, file), "utf8")]),
  )
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

describe("derived Fluent plant assets", () => {
  it("stay deterministic, transparent by default, and size calibrated blooms", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "razzoozle-fluent-plants-"))

    try {
      const firstRun = derivePlants(join(tempRoot, "layout-a"))
      const secondRun = derivePlants(join(tempRoot, "layout-b"))
      const committed = readPlants(COMMITTED_ROOT)

      expect(hashPlants(secondRun)).toEqual(hashPlants(firstRun))
      expect(committed).toEqual(firstRun)
      expect(Object.keys(committed)).toHaveLength(14)

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
})
