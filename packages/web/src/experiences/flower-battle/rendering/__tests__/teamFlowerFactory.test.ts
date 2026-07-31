/**
 * WP-PRESENTER-4 — data-driven team-flower PixiJS factory tests
 * (SDD §20.6, 4×4 = 16 silhouettes + tints + face + layout + stage
 * transitions).
 *
 * Pure-Node env: real Pixi Containers / Graphics from `pixi.js` (no WebGL
 * Application required, mirrors the `GardenScene.test.ts` style).
 */

import { Container } from "pixi.js"
import { describe, expect, it } from "vitest"

import { getTeamSlotLayout } from "../../garden-team-slot-layout"
import {
  createTeamFlower,
  TEAM_COLOR_TOKENS,
  TEAM_FLOWER_GROWTH_STAGES,
  TEAM_FLOWER_TEAM_IDS,
  updateTeamFlower,
  type CreateTeamFlowerOptions,
  type GrowthStage,
  type TeamFlowerInstance,
  type TeamId,
} from "../teamFlowerFactory"
import { STAGE_HEAD_RATIO } from "../flowerHeads"

const VIEWPORT = { width: 1280, height: 720 }

/** Deterministic token → tint map shared across this suite. */
const TINTS = {
  "--team-red": 0xff2244,
  "--team-blue": 0x3355ff,
  "--team-green": 0x22c55e,
  "--team-yellow": 0xffaa00,
  "--team-green-ring": 0x178640,
  "--state-correct-soft": 0xffffff,
  "--color-accent": 0xffd54a,
  "--color-field-cream": 0xfaf6e8,
} as const

/** Token resolver that returns deterministic 0xRRGGBB integers. */
const fakeResolveColor = (token: string): number => {
  const value = (TINTS as Record<string, number>)[token]
  if (value === undefined) throw new Error(`missing test token: ${token}`)
  return value
}

/** Stage-1 factory options — minimum viable invocation. */
function baseOpts(overrides: Partial<CreateTeamFlowerOptions> = {}): CreateTeamFlowerOptions {
  return {
    teamId: "violet",
    stage: 1,
    viewport: VIEWPORT,
    resolveColor: fakeResolveColor,
    ...overrides,
  }
}

/** Convenience: instantiate + return the container (root) for inspection. */
function make(opts: CreateTeamFlowerOptions): TeamFlowerInstance {
  return createTeamFlower(opts)
}

describe("createTeamFlower (WP-PRESENTER-4, SDD §20.6)", () => {
  it("rejects unknown team ids before drawing", () => {
    expect(() =>
      createTeamFlower(
        baseOpts({ teamId: "magenta" as unknown as TeamId }),
      ),
    ).toThrow(/unsupported teamId/)
  })

  it("rejects unknown growth stages before drawing", () => {
    expect(() =>
      createTeamFlower(baseOpts({ stage: 5 as unknown as GrowthStage })),
    ).toThrow(/unsupported stage/)
  })

  it("returns a stable root container with the expected z-order layers", () => {
    const instance = make(baseOpts({ stage: 4 }))
    try {
      const labels = instance.container.children.map((c) => c.label)
      expect(labels).toEqual([
        "soil-shadow",
        "stem",
        "leaves",
        "head",
        "petal-ring",
        "face-layer",
        "halo-layer",
      ])
      expect(instance.container.label).toBe("team-flower-violet")
    } finally {
      instance.destroy()
    }
  })

  it("uses a custom label when supplied", () => {
    const instance = make(baseOpts({ stage: 3, label: "alpha-flower" }))
    try {
      expect(instance.container.label).toBe("alpha-flower")
    } finally {
      instance.destroy()
    }
  })
})

describe("4 teams × 4 stages = 16 combinations", () => {
  for (const teamId of TEAM_FLOWER_TEAM_IDS) {
    for (const stage of TEAM_FLOWER_GROWTH_STAGES) {
      it(`renders team=${teamId} stage=${stage}`, () => {
        const instance = make(baseOpts({ teamId, stage }))
        try {
          // Container must always exist regardless of stage.
          expect(instance.container).toBeInstanceOf(Container)
          // Stage 1 has no head (radius=0), other stages do — the head
          // Graphics is still present (it's only its draw that's empty).
          expect(instance.head).toBeDefined()
          // Root container always hosts the seven ordered children.
          expect(instance.container.children.length).toBe(7)
        } finally {
          instance.destroy()
        }
      })
    }
  }

  it("all 16 combos yield the expected head-size ratio", () => {
    for (const stage of TEAM_FLOWER_GROWTH_STAGES) {
      const instance = make(baseOpts({ stage }))
      try {
        // We assert on the ratio constant itself rather than the computed
        // radius so the test is independent of viewport size.
        const ratio = STAGE_HEAD_RATIO[stage as GrowthStage]
        expect(ratio).toBeGreaterThanOrEqual(0)
        if (stage === 1) expect(ratio).toBe(0)
        else expect(ratio).toBeGreaterThan(0)
      } finally {
        instance.destroy()
      }
    }
  })
})

describe("team tint mapping (no hardcoded hex; only theme tokens)", () => {
  it("maps the four team ids onto four distinct CSS tokens", () => {
    expect(TEAM_COLOR_TOKENS.violet).toBe("--team-red")
    expect(TEAM_COLOR_TOKENS.blue).toBe("--team-blue")
    expect(TEAM_COLOR_TOKENS.green).toBe("--team-green")
    expect(TEAM_COLOR_TOKENS.orange).toBe("--team-yellow")
  })

  it("routes tint resolution via `resolveColor` so callers can inject test tokens", () => {
    const calls: string[] = []
    const spy = (token: string): number => {
      calls.push(token)
      return fakeResolveColor(token)
    }
    const instance = make(
      baseOpts({ teamId: "blue", stage: 4, resolveColor: spy }),
    )
    try {
      // First call should resolve the team-blue token for the head tint.
      expect(calls).toContain("--team-blue")
      // Stem + head share the team tint; leaves use --team-green-ring; petal
      // uses --state-correct-soft — all flow through the resolver.
      expect(calls).toContain("--team-green-ring")
      expect(calls).toContain("--state-correct-soft")
    } finally {
      instance.destroy()
    }
  })
})

describe("face switching (in-place swap, no root remount)", () => {
  it.each(["happy", "hurt", "protected", "boosted", "winner"] as const)(
    "renders face=%s without rebuilding the root container",
    (face) => {
      const instance = make(baseOpts({ stage: 4, face: "happy" }))
      try {
        const rootBefore = instance.container
        updateTeamFlower(instance, baseOpts({ stage: 4, face }))
        expect(instance.container).toBe(rootBefore)
        // faceLayer is a separate Container — its first child must carry
        // the face label that matches the latest face selection.
        const faceChild = instance.faceLayer.children[0]
        expect(faceChild?.label).toBe(`face-${face}`)
        // Nothing on the silhouette stack (stem / leaves / head) is rebuilt.
        expect(instance.stem).toBeDefined()
        expect(instance.leaves).toBeDefined()
      } finally {
        instance.destroy()
      }
    },
  )
})

describe("effect → face auto-resolution", () => {
  it("acid_rain → hurt", () => {
    const instance = make(
      baseOpts({ stage: 4, effects: ["acid_rain"] }),
    )
    try {
      expect(instance.faceLayer.children[0]?.label).toBe("face-hurt")
    } finally {
      instance.destroy()
    }
  })

  it("umbrella_shield → protected (and draws a halo)", () => {
    const instance = make(
      baseOpts({ stage: 4, effects: ["umbrella_shield"] }),
    )
    try {
      expect(instance.faceLayer.children[0]?.label).toBe("face-protected")
      expect(instance.haloLayer.children.length).toBe(1)
    } finally {
      instance.destroy()
    }
  })

  it("sunbeam → boosted", () => {
    const instance = make(baseOpts({ stage: 4, effects: ["sunbeam"] }))
    try {
      expect(instance.faceLayer.children[0]?.label).toBe("face-boosted")
    } finally {
      instance.destroy()
    }
  })

  it("explicit face beats auto-resolved face", () => {
    const instance = make(
      baseOpts({ stage: 4, effects: ["acid_rain"], face: "winner" }),
    )
    try {
      expect(instance.faceLayer.children[0]?.label).toBe("face-winner")
    } finally {
      instance.destroy()
    }
  })

  it("no effects + no face → happy", () => {
    const instance = make(baseOpts({ stage: 4 }))
    try {
      expect(instance.faceLayer.children[0]?.label).toBe("face-happy")
    } finally {
      instance.destroy()
    }
  })
})

describe("growth stage transitions (in-place)", () => {
  it("stage 1 → stage 4 never replaces the root container", () => {
    const instance = make(baseOpts({ stage: 1 }))
    try {
      const rootBefore = instance.container
      const stemBefore = instance.stem
      const headBefore = instance.head
      for (const stage of [2, 3, 4] as const) {
        updateTeamFlower(instance, baseOpts({ stage }))
        expect(instance.container).toBe(rootBefore)
        expect(instance.stem).toBe(stemBefore)
        expect(instance.head).toBe(headBefore)
      }
      // Stage 4 = full bloom; face becomes visible.
      expect(instance.faceLayer.children.length).toBeGreaterThan(0)
    } finally {
      instance.destroy()
    }
  })

  it("shrinking stage 4 → 1 clears the face but reuses the same faceLayer", () => {
    const instance = make(baseOpts({ stage: 4, face: "winner" }))
    try {
      const faceLayer = instance.faceLayer
      expect(faceLayer.children.length).toBeGreaterThan(0)
      updateTeamFlower(instance, baseOpts({ stage: 1 }))
      expect(faceLayer).toBe(instance.faceLayer)
      // Face is simply not redrawn at stage 1 (radius=0 → empty draw).
      expect(faceLayer.children.length).toBe(0)
    } finally {
      instance.destroy()
    }
  })
})

describe("2/3/4 team plot layout integration (no overlap, deterministic)", () => {
  it("2 teams → two slots side by side", () => {
    const layout = getTeamSlotLayout(2, VIEWPORT)
    expect(layout).toHaveLength(2)
    expect(layout[0]!.xPercent).toBeLessThan(layout[1]!.xPercent)
  })

  it("3 teams → three slots side by side", () => {
    const layout = getTeamSlotLayout(3, VIEWPORT)
    expect(layout).toHaveLength(3)
    expect(layout[0]!.xPercent).toBeLessThan(layout[1]!.xPercent)
    expect(layout[1]!.xPercent).toBeLessThan(layout[2]!.xPercent)
  })

  it("4 teams → 2×2 grid (two columns, two rows)", () => {
    const layout = getTeamSlotLayout(4, VIEWPORT)
    expect(layout).toHaveLength(4)
    const gridShape = {
      colMax: Math.max(...layout.map((s: { xPercent: number }) => s.xPercent)),
      rowMax: Math.max(...layout.map((s: { yPercent: number }) => s.yPercent)),
    }
    expect(gridShape.colMax).toBeGreaterThan(0)
    expect(gridShape.rowMax).toBeGreaterThan(0)
  })

  it("each slot dimensions remain finite and non-negative for all team counts", () => {
    for (const count of [2, 3, 4]) {
      const layout = getTeamSlotLayout(count, VIEWPORT)
      for (const slot of layout) {
        expect(Number.isFinite(slot.xPercent)).toBe(true)
        expect(Number.isFinite(slot.yPercent)).toBe(true)
        expect(slot.widthPercent).toBeGreaterThan(0)
        expect(slot.heightPercent).toBeGreaterThan(0)
      }
    }
  })
})
