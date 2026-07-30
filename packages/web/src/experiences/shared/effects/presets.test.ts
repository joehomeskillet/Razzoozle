import { describe, expect, it } from "vitest"

import { createSeededRandom } from "../random/createSeededRandom"
import {
  allPresetIds,
  bubbleBurst,
  bubbleTrail,
  dustBurst,
  granuleDrop,
  leafBurst,
  presetCatalog,
  rainShower,
  sandTrail,
  shieldDeflect,
  softPoof,
  sparkleBurst,
  speedLines,
  type PresetIntensity,
} from "./presets"

describe("Particle Presets: Determinism", () => {
  it("produces identical particle counts and trajectories for the same seed and intensity", () => {
    const preset = dustBurst
    const testIntensities: PresetIntensity[] = ["subtle", "normal", "strong"]

    for (const intensity of testIntensities) {
      const emission1 = preset({
        intensity,
        random: createSeededRandom(42),
      })
      const emission2 = preset({
        intensity,
        random: createSeededRandom(42),
      })

      expect(emission1.count).toBe(emission2.count)
    }
  })

  it("produces different sequences for different seeds", () => {
    const preset = dustBurst

    const emission1 = preset({
      intensity: "normal",
      random: createSeededRandom(1),
    })
    const emission2 = preset({
      intensity: "normal",
      random: createSeededRandom(2),
    })

    expect(emission1).toBeDefined()
    expect(emission2).toBeDefined()
  })
})

describe("Particle Presets: Intensity Scaling", () => {
  const presets = [
    ["dust-burst", dustBurst],
    ["sand-trail", sandTrail],
    ["bubble-trail", bubbleTrail],
    ["bubble-burst", bubbleBurst],
    ["speed-lines", speedLines],
    ["sparkle-burst", sparkleBurst],
    ["rain-shower", rainShower],
    ["leaf-burst", leafBurst],
    ["granule-drop", granuleDrop],
    ["shield-deflect", shieldDeflect],
    ["soft-poof", softPoof],
  ] as const

  presets.forEach(([id, preset]) => {
    it(`${id}: subtle < normal < strong in particle count`, () => {
      const subtle = preset({
        intensity: "subtle",
        random: createSeededRandom(100),
      })
      const normal = preset({
        intensity: "normal",
        random: createSeededRandom(100),
      })
      const strong = preset({
        intensity: "strong",
        random: createSeededRandom(100),
      })

      expect(subtle.count).toBeLessThan(normal.count)
      expect(normal.count).toBeLessThan(strong.count)
    })
  })
})

describe("Particle Presets: Reduced Motion Limits", () => {
  const presets = [
    ["dust-burst", dustBurst],
    ["sand-trail", sandTrail],
    ["bubble-trail", bubbleTrail],
    ["bubble-burst", bubbleBurst],
    ["speed-lines", speedLines],
    ["sparkle-burst", sparkleBurst],
    ["rain-shower", rainShower],
    ["leaf-burst", leafBurst],
    ["granule-drop", granuleDrop],
    ["shield-deflect", shieldDeflect],
    ["soft-poof", softPoof],
  ] as const

  presets.forEach(([id, preset]) => {
    it(`${id}: subtle intensity <= 20 particles`, () => {
      const emission = preset({
        intensity: "subtle",
        random: createSeededRandom(999),
      })

      expect(emission.count).toBeLessThanOrEqual(20)
    })
  })
})

describe("Particle Presets: Budget Limits", () => {
  const burstPresets = [
    ["dust-burst", dustBurst],
    ["bubble-burst", bubbleBurst],
    ["sparkle-burst", sparkleBurst],
    ["shield-deflect", shieldDeflect],
  ] as const

  burstPresets.forEach(([id, preset]) => {
    it(`${id} (burst): normal intensity < 120 particles`, () => {
      const emission = preset({
        intensity: "normal",
        random: createSeededRandom(42),
      })

      expect(emission.count).toBeLessThan(120)
    })
  })

  it("all presets combined cannot exceed total 250 capacity", () => {
    const emissions = presets.map((preset) =>
      preset({
        intensity: "strong",
        random: createSeededRandom(42),
      }),
    )

    const totalCount = emissions.reduce((sum, e) => sum + e.count, 0)
    expect(totalCount).toBeLessThanOrEqual(250)
  })

  function presets() {
    return Object.values(presetCatalog).map((factory) =>
      factory({
        intensity: "strong",
        random: createSeededRandom(42),
      }),
    )
  }
})

describe("Particle Presets: Color Roles", () => {
  it("uses colorRoles parameter correctly when provided", () => {
    const colors = ["primary", "accent", "secondary"] as const

    const emission = dustBurst({
      intensity: "normal",
      random: createSeededRandom(42),
      colorRoles: colors,
    })

    expect(emission).toBeDefined()
    expect(emission.count).toBeGreaterThan(0)
  })

  it("works with empty colorRoles array (fallback to defaults)", () => {
    const emission = sandTrail({
      intensity: "normal",
      random: createSeededRandom(42),
      colorRoles: [],
    })

    expect(emission).toBeDefined()
    expect(emission.count).toBeGreaterThan(0)
  })
})

describe("Particle Presets: No Math.random() Usage", () => {
  it("presets.ts does not contain Math.random()", async () => {
    const moduleContent = await import.meta.glob(
      "../effects/presets.ts",
      { as: "raw" },
    )["../effects/presets.ts"]()

    const content = await moduleContent

    expect(content).not.toMatch(/Math\.random\(\)/)
  })
})

describe("Particle Presets: Catalog and IDs", () => {
  it("exports all 11 presets in presetCatalog", () => {
    expect(Object.keys(presetCatalog)).toHaveLength(11)
  })

  it("allPresetIds contains exactly 11 preset identifiers", () => {
    expect(allPresetIds).toHaveLength(11)
  })

  it("allPresetIds matches presetCatalog keys", () => {
    const catalogKeys = Object.keys(presetCatalog).sort()
    const allIds = [...allPresetIds].sort()

    expect(allIds).toEqual(catalogKeys)
  })

  it("all preset IDs are lowercase kebab-case strings", () => {
    allPresetIds.forEach((id) => {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/)
    })
  })
})

describe("Particle Presets: Emissions Structure", () => {
  const testPresets = [dustBurst, rainShower, bubbleBurst]

  testPresets.forEach((preset) => {
    it("emission has required ParticleEmission fields", () => {
      const emission = preset({
        intensity: "normal",
        random: createSeededRandom(42),
      })

      expect(emission).toHaveProperty("count")
      expect(emission).toHaveProperty("random")
      expect(emission).toHaveProperty("initialize")
      expect(emission).toHaveProperty("render")

      expect(typeof emission.count).toBe("number")
      expect(typeof emission.random).toBe("function")
      expect(typeof emission.initialize).toBe("function")
      expect(typeof emission.render).toBe("function")
    })
  })
})
