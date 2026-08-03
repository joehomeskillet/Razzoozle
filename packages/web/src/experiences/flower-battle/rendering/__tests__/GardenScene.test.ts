/**
 * WP-PIX-05A GardenScene contract tests.
 * Node env + real Pixi Containers/Graphics (no WebGL Application required).
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import {
  registerGardenTextureAlias,
  type GardenAssetDiagnostics,
  type PlantVariantTextures,
} from "../../assets/loadGardenSceneAssets"
import type { GardenPixiApplicationHandle } from "../../garden-pixi.types"
import { createGardenScene, LAYER_LABELS } from "../GardenScene"
import type { GardenPalette } from "../gardenPalette"
import {
  computeVisibleLogicalRect,
  fitLogicalViewport,
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
} from "../gardenViewport"
import { computePlotAnchors } from "../plotAnchors"
import {
  ThemeTokenColorError,
  THEME_TOKEN_COLOR_ERROR,
} from "../resolveThemeColor"

/** Deterministic palette — test-only injection, not production fallback. */
const TEST_PALETTE: GardenPalette = {
  sky: 0x87b5e0,
  sun: 0xffd54a,
  cloud: 0xf5f5f5,
  hillBack: 0x4a8f4a,
  hillMid: 0x5aad5a,
  bushBack: 0x3d7a3d,
  bushMid: 0x3d7a3d,
  midground: 0x3d7a3d,
  fence: 0xfaf6e8,
  grass: 0x6bbf59,
  soil: 0xc4a574,
  soilEdge: 0x8b6914,
  foreground: 0x2f6b2f,
  plantStem: 0x2d6a2d,
  plantLeaf: 0x4caf50,
  plantPetal: 0xe57373,
  hillsFar: 0x4a8f4a,
  hillsNear: 0x5aad5a,
  clouds: 0xf5f5f5,
  teamMeterFrame: 0x222222,
}

function fakeApp(
  width = 1920,
  height = 1080,
): GardenPixiApplicationHandle & { stage: Container } {
  const stage = new Container()
  stage.label = "stage"
  return {
    canvas: {} as HTMLCanvasElement,
    renderer: {
      resize: () => {},
      width,
      height,
    },
    ticker: { start: () => {}, stop: () => {} },
    destroy: () => {},
    stage,
  }
}

function team(name: string, growthStage: number) {
  return { name, growthStage }
}

/** Walk the entire Pixi scene graph and collect every node label as a string. */
function collectLabels(root: Container): string[] {
  const out: string[] = []
  const visit = (node: Container): void => {
    if (typeof node.label === "string" && node.label.length > 0) {
      out.push(node.label)
    }
    for (const child of node.children) {
      if (child instanceof Container) visit(child)
    }
  }
  visit(root)
  return out
}

describe("createGardenScene", () => {
  it("builds one root with stable ordered layers", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })

    expect(scene.root.label).toBe("garden-root")
    expect(scene.root.children.map((c) => c.label)).toEqual([...LAYER_LABELS])
    expect(app.stage.children).toContain(scene.root)

    // Layer set mirrors child order
    expect(scene.layers.ordered.map((l) => l.label)).toEqual([...LAYER_LABELS])
    scene.destroy()
  })

  it.each([
    { teams: 2, w: 1920, h: 1080, label: "16:9" },
    { teams: 3, w: 1600, h: 1200, label: "4:3" },
    { teams: 4, w: 2560, h: 1080, label: "ultrawide" },
  ] as const)(
    "anchors $teams teams at $label without depending on growth",
    ({ teams, w, h }) => {
      const app = fakeApp(w, h)
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateLayout(w, h)

      const roster = Array.from({ length: teams }, (_, i) => team(`T${i}`, 0))
      scene.updateSnapshot({ teams: roster, phase: "question" })

      // Anchors derive from the *visible* band so cover-crop hosts never
      // amputate plants (WP immersive §13). On 16:9 this equals the legacy
      // full-frame layout; on 4:3/ultrawide it is the cropped inner band.
      const visible = computeVisibleLogicalRect(fitLogicalViewport(w, h))
      const expected = computePlotAnchors(
        teams,
        GARDEN_LOGICAL_WIDTH,
        GARDEN_LOGICAL_HEIGHT,
        visible,
      )
      expect(scene.getPlotAnchors()).toEqual(expected)

      // Letterbox applied to the single root
      const box = scene.getLetterbox()
      expect(box).not.toBeNull()
      expect(scene.root.scale.x).toBeCloseTo(box!.scale, 8)
      expect(scene.root.position.x).toBeCloseTo(box!.offsetX, 8)
      expect(scene.root.position.y).toBeCloseTo(box!.offsetY, 8)

      // Plants sit on anchors
      expect(scene.layers.actors.children).toHaveLength(teams)
      for (let i = 0; i < teams; i += 1) {
        const plant = scene.layers.actors.children[i]!
        expect(plant.position.x).toBe(expected[i]!.x)
        expect(plant.position.y).toBe(expected[i]!.y)
      }

      scene.destroy()
    },
  )

  it("keeps exact plot anchors across growth and phase updates", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })
    const rootRef = scene.root

    scene.updateSnapshot({
      teams: [team("A", 1), team("B", 2), team("C", 3)],
      phase: "lobby",
    })

    const anchorsBefore = scene.getPlotAnchors().map((a) => ({ ...a }))
    const plantRoots = scene.layers.actors.children.slice()
    const soilBefore = scene.layers.plots.children.map((c) => ({
      x: c.position.x,
      y: c.position.y,
    }))

    scene.updateSnapshot({
      teams: [team("A", 7), team("B", 8), team("C", 10)],
      phase: "reveal",
    })

    expect(scene.root).toBe(rootRef)
    expect(scene.getPlotAnchors()).toEqual(anchorsBefore)
    expect(scene.layers.actors.children).toEqual(plantRoots)
    expect(
      scene.layers.plots.children.map((c) => ({
        x: c.position.x,
        y: c.position.y,
      })),
    ).toEqual(soilBefore)

    for (let i = 0; i < 3; i += 1) {
      const plant = scene.layers.actors.children[i]!
      expect(plant.position.x).toBe(anchorsBefore[i]!.x)
      expect(plant.position.y).toBe(anchorsBefore[i]!.y)
    }

    expect(scene.phase).toBe("reveal")
    scene.destroy()
  })

  it("does not create a new root or Application on updateSnapshot", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })
    const root = scene.root
    const stageChildCount = app.stage.children.length

    scene.updateSnapshot({ teams: [team("A", 0), team("B", 0)] })
    scene.updateSnapshot({ teams: [team("A", 5), team("B", 6)] })
    scene.updateLayout(1280, 720)

    expect(scene.root).toBe(root)
    expect(app.stage.children.length).toBe(stageChildCount)
    expect(app.stage.children[0]).toBe(root)
    scene.destroy()
  })

  it("destroy is idempotent and detaches the root", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })
    scene.updateSnapshot({ teams: [team("A", 1), team("B", 2)] })

    scene.destroy()
    expect(app.stage.children).not.toContain(scene.root)
    expect(() => scene.destroy()).not.toThrow()
    expect(() => scene.destroy()).not.toThrow()

    // Further updates are no-ops after destroy
    expect(() =>
      scene.updateSnapshot({ teams: [team("A", 9), team("B", 9)] }),
    ).not.toThrow()
    expect(() => scene.updateLayout(800, 600)).not.toThrow()
  })

  describe("FB-HUD4: Pixi team HUD removed (cards live in DOM under each plant)", () => {
    it("presenterHud layer is empty — no team-hud-* Pixi widgets", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({
        teams: [team("Violet", 3), team("Orange", 7)],
        phase: "question",
      })

      // The per-plot Pixi team HUD is gone (FB-HUD4). presenterHud is now
      // a reserved layer for any future overlay; it must contain zero
      // team-hud-* children so the canvas never re-introduces a global
      // HUD under the plant.
      const teamHudChildren = scene.layers.presenterHud.children.filter(
        (c) =>
          typeof c.label === "string" && c.label.startsWith("team-hud-"),
      )
      expect(teamHudChildren).toHaveLength(0)

      // The plant actors are still identity-stable per team.
      expect(scene.layers.actors.children).toHaveLength(2)
      expect((scene.layers.actors.children[0] as Container).label).toBe(
        "actor-plant-0",
      )
      expect((scene.layers.actors.children[1] as Container).label).toBe(
        "actor-plant-1",
      )

      scene.destroy()
    })

    it("never mounts a team-hud label, segmented meter or status chip anywhere in the scene", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2), team("C", 3), team("D", 4)],
      })

      // No legacy Pixi widgets anywhere in the scene graph.
      const allLabels = collectLabels(scene.root)
      for (const label of allLabels) {
        expect(label).not.toMatch(/^team-hud-/)
        expect(label).not.toBe("team-hud-label")
        expect(label).not.toBe("team-hud-label-text")
        expect(label).not.toBe("team-hud-meter")
        expect(label).not.toBe("team-hud-meter-growth")
        expect(label).not.toBe("team-hud-meter-sun")
        expect(label).not.toBe("team-hud-chip")
        expect(label).not.toBe("team-hud-chip-bg")
        expect(label).not.toBe("team-hud-chip-text")
      }

      scene.destroy()
    })

    it("keeps plant actors identity-stable across updateSnapshot (no re-mount on growth)", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({ teams: [team("A", 1), team("B", 2)] })
      const plantsBefore = scene.layers.actors.children.slice()

      scene.updateSnapshot({ teams: [team("Alpha", 9), team("Beta", 10)] })

      expect(scene.layers.actors.children).toEqual(plantsBefore)
      // presenterHud still has no team-hud children.
      expect(
        scene.layers.presenterHud.children.filter((c) =>
          String(c.label).startsWith("team-hud-"),
        ),
      ).toHaveLength(0)

      scene.destroy()
    })

    it("trims plants when team count shrinks and cleans the scene on destroy", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2), team("C", 3)],
      })
      expect(scene.layers.actors.children).toHaveLength(3)

      scene.updateSnapshot({ teams: [team("A", 4), team("B", 5)] })
      expect(scene.layers.actors.children).toHaveLength(2)

      scene.destroy()
      // Root destroyed — stage no longer holds the scene.
      expect(app.stage.children).not.toContain(scene.root)
    })
  })

  it("surfaces controlled palette errors for host static fallback", () => {
    const app = fakeApp()
    expect(() =>
      createGardenScene(app, {
        resolveColor: () => {
          throw new ThemeTokenColorError("--surface-2", "empty computed value")
        },
      }),
    ).toThrow(ThemeTokenColorError)

    try {
      createGardenScene(app, {
        resolveColor: () => {
          throw new ThemeTokenColorError("--surface-2", "empty computed value")
        },
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ThemeTokenColorError)
      expect((err as ThemeTokenColorError).code).toBe(THEME_TOKEN_COLOR_ERROR)
    }
  })

  describe("getE2EIdentity", () => {
    it("returns real root and plant roots with actor-plant labels", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2), team("C", 3)],
        phase: "question",
      })

      expect(typeof scene.getE2EIdentity).toBe("function")
      const identity = scene.getE2EIdentity()
      expect(identity.root).toBe(scene.root)
      expect(identity.actorPlants).toHaveLength(3)
      expect(identity.labels).toEqual([
        "actor-plant-0",
        "actor-plant-1",
        "actor-plant-2",
      ])
      for (let i = 0; i < 3; i += 1) {
        expect(identity.actorPlants[i]).toBe(scene.layers.actors.children[i])
        expect(identity.actorPlants[i]).toBe(
          scene.layers.actors.children[i] as Container,
        )
        expect((identity.actorPlants[i] as Container).label).toBe(
          `actor-plant-${i}`,
        )
      }
      scene.destroy()
    })

    it("keeps === root and each plant root across Q1 → Result → Q2 at stable team count", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })

      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2)],
        phase: "question",
      })
      const q1 = scene.getE2EIdentity()
      expect(q1.root).toBe(scene.root)
      expect(q1.actorPlants[0]).toBe(scene.layers.actors.children[0])
      expect(q1.actorPlants[1]).toBe(scene.layers.actors.children[1])

      scene.updateSnapshot({
        teams: [team("A", 7), team("B", 8)],
        phase: "result",
      })
      const result = scene.getE2EIdentity()
      expect(result.root).toBe(q1.root)
      expect(result.actorPlants[0]).toBe(q1.actorPlants[0])
      expect(result.actorPlants[1]).toBe(q1.actorPlants[1])
      expect(result.labels).toEqual(q1.labels)

      scene.updateSnapshot({
        teams: [team("A", 3), team("B", 4)],
        phase: "question",
      })
      const q2 = scene.getE2EIdentity()
      expect(q2.root).toBe(q1.root)
      expect(q2.actorPlants[0]).toBe(q1.actorPlants[0])
      expect(q2.actorPlants[1]).toBe(q1.actorPlants[1])
      expect(q2.labels).toEqual(["actor-plant-0", "actor-plant-1"])
      // Not mere value equality — same object references.
      expect(q2.actorPlants).not.toBe(q1.actorPlants)
      expect(q2.actorPlants[0] === q1.actorPlants[0]).toBe(true)

      scene.destroy()
    })

    it("follows existing index contract when team count changes", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })

      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2)],
        phase: "question",
      })
      const two = scene.getE2EIdentity()
      expect(two.actorPlants).toHaveLength(2)

      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2), team("C", 3)],
        phase: "question",
      })
      const three = scene.getE2EIdentity()
      expect(three.actorPlants).toHaveLength(3)
      // Index reuse: plants 0 and 1 stay the same instances.
      expect(three.actorPlants[0]).toBe(two.actorPlants[0])
      expect(three.actorPlants[1]).toBe(two.actorPlants[1])
      expect(three.actorPlants[2]).not.toBe(two.actorPlants[0])
      expect(three.actorPlants[2]).not.toBe(two.actorPlants[1])
      expect(three.labels).toEqual([
        "actor-plant-0",
        "actor-plant-1",
        "actor-plant-2",
      ])
      expect(three.root).toBe(two.root)

      scene.updateSnapshot({
        teams: [team("A", 4), team("B", 5)],
        phase: "question",
      })
      const shrunk = scene.getE2EIdentity()
      expect(shrunk.actorPlants).toHaveLength(2)
      expect(shrunk.actorPlants[0]).toBe(two.actorPlants[0])
      expect(shrunk.actorPlants[1]).toBe(two.actorPlants[1])
      expect(shrunk.labels).toEqual(["actor-plant-0", "actor-plant-1"])
      expect(shrunk.root).toBe(two.root)

      scene.updateSnapshot({
        teams: [team("A", 6), team("B", 7), team("C", 8)],
        phase: "question",
      })
      const regrown = scene.getE2EIdentity()
      expect(regrown.actorPlants).toHaveLength(3)
      expect(regrown.actorPlants[0]).toBe(two.actorPlants[0])
      expect(regrown.actorPlants[1]).toBe(two.actorPlants[1])
      expect(regrown.actorPlants[2]).not.toBe(three.actorPlants[2])
      expect(regrown.labels).toEqual([
        "actor-plant-0",
        "actor-plant-1",
        "actor-plant-2",
      ])
      expect(regrown.root).toBe(two.root)

      scene.destroy()
    })
  })
})

describe("SDD §30 probe-v3 contract on procedural scene", () => {
  it("updateSnapshot exposes revision, teamNames, growthStages parallel to actorPlants", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })
    scene.updateSnapshot({
      teams: [team("Violet", 1), team("Orange", 2)],
      phase: "question",
    })
    const identity = scene.getE2EIdentity()
    expect(identity.revision).toBe(1)
    expect(identity.teamNames).toEqual(["Violet", "Orange"])
    expect(identity.growthStages).toEqual([1, 2])
    expect(identity.teamNames.length).toBe(identity.actorPlants.length)
    expect(identity.growthStages.length).toBe(identity.actorPlants.length)
    scene.destroy()
  })

  it("revision increments on every updateSnapshot, even when team count stays stable", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })
    scene.updateSnapshot({ teams: [team("A", 0), team("B", 0)] })
    expect(scene.revision).toBe(1)
    scene.updateSnapshot({ teams: [team("A", 3), team("B", 4)] })
    expect(scene.revision).toBe(2)
    scene.updateSnapshot({ teams: [team("A", 5), team("B", 6)] })
    expect(scene.revision).toBe(3)
    expect(scene.getE2EIdentity().revision).toBe(3)
    expect(scene.getE2EIdentity().growthStages).toEqual([5, 6])
    scene.destroy()
  })

  it("teamNames follow slot index after shrink (slot 0 retains its plant instance)", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })
    scene.updateSnapshot({
      teams: [team("Violet", 1), team("Orange", 2)],
    })
    const wide = scene.getE2EIdentity()
    const violetPlant = wide.actorPlants[0]
    scene.updateSnapshot({
      teams: [team("Cobalt", 9)],
    })
    const shrunk = scene.getE2EIdentity()
    expect(shrunk.teamNames).toEqual(["Cobalt"])
    expect(shrunk.growthStages).toEqual([9])
    expect(shrunk.actorPlants[0]).toBe(violetPlant)
    scene.destroy()
  })

  describe("safe-content layout (WP immersive §11/§13)", () => {
    it("pulls plot anchors into the visible band on 4:3 hosts", () => {
      const app = fakeApp(1024, 768)
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateLayout(1024, 768)
      scene.updateSnapshot({
        teams: [team("A", 5), team("B", 5)],
        phase: "question",
      })

      const visible = scene.getVisibleRect()!
      expect(visible).not.toBeNull()
      expect(visible.x).toBeGreaterThan(0) // 4:3 crops left/right

      for (const a of scene.getPlotAnchors()) {
        expect(a.x).toBeGreaterThan(visible.x)
        expect(a.x).toBeLessThan(visible.x + visible.width)
      }
      // Plants physically sit on the clamped anchors.
      for (const [i, plant] of scene.layers.actors.children.entries()) {
        expect(plant.position.x).toBe(scene.getPlotAnchors()[i]!.x)
        expect(plant.position.y).toBe(scene.getPlotAnchors()[i]!.y)
      }
      scene.destroy()
    })

    it("repositions anchors on resize without recreating plant instances", () => {
      const app = fakeApp(1920, 1080)
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateLayout(1920, 1080)
      scene.updateSnapshot({
        teams: [team("A", 3), team("B", 3), team("C", 3), team("D", 3)],
      })

      const anchors16x9 = scene.getPlotAnchors().map((a) => ({ ...a }))
      const plantsBefore = scene.layers.actors.children.slice()
      const identityBefore = scene.getE2EIdentity()

      // Host window changes to 4:3 — anchors must move into the new band…
      scene.updateLayout(1024, 768)
      const anchors4x3 = scene.getPlotAnchors()
      expect(anchors4x3).not.toEqual(anchors16x9)

      const visible = scene.getVisibleRect()!
      for (const a of anchors4x3) {
        expect(a.x).toBeGreaterThan(visible.x)
        expect(a.x).toBeLessThan(visible.x + visible.width)
      }

      // …while plant object identity stays bit-stable (SDD §30).
      expect(scene.layers.actors.children).toEqual(plantsBefore)
      const identityAfter = scene.getE2EIdentity()
      expect(identityAfter.actorPlants).toEqual(identityBefore.actorPlants)
      expect(identityAfter.root).toBe(identityBefore.root)

      // Back to 16:9 restores the original anchor layout exactly.
      scene.updateLayout(1920, 1080)
      expect(scene.getPlotAnchors()).toEqual(anchors16x9)
      scene.destroy()
    })

    it("keeps the sun and all clouds inside the visible band on crop hosts", () => {
      // 1×1 white textures hydrate the sprite path so real `cloud-sprite-*`
      // and `sun-sprite` children exist (positions are texture-independent).
      const layerAssets = {
        sun: Texture.WHITE,
        cloud01: Texture.WHITE,
        cloud02: Texture.WHITE,
        cloud03: Texture.WHITE,
        cloud04: Texture.WHITE,
      }
      for (const [w, h, label] of [
        [1920, 1080, "16:9"],
        [1024, 768, "4:3"],
        [2560, 1080, "ultrawide"],
        [1366, 768, "notebook"],
      ] as const) {
        const app = fakeApp(w, h)
        const scene = createGardenScene(app, {
          palette: TEST_PALETTE,
          layerAssets,
        })
        scene.updateLayout(w, h)

        const visible = scene.getVisibleRect()!
        const sun = scene.layers.sky.children.find(
          (c) => c.label === "sun-holder",
        )!
        expect(sun, label).toBeDefined()
        expect(sun.position.x, label).toBeGreaterThanOrEqual(visible.x)
        expect(sun.position.x, label).toBeLessThanOrEqual(
          visible.x + visible.width,
        )
        expect(sun.position.y, label).toBeGreaterThanOrEqual(visible.y)
        expect(sun.position.y, label).toBeLessThanOrEqual(
          visible.y + visible.height,
        )

        const clouds = scene.layers.sky.children.filter(
          (c) =>
            typeof c.label === "string" && c.label.startsWith("cloud-sprite-"),
        )
        expect(clouds.length, label).toBeGreaterThan(0)
        for (const cloud of clouds) {
          expect(
            cloud.position.x,
            `${label} ${cloud.label}`,
          ).toBeGreaterThanOrEqual(visible.x)
          expect(
            cloud.position.x,
            `${label} ${cloud.label}`,
          ).toBeLessThanOrEqual(visible.x + visible.width)
          expect(
            cloud.position.y,
            `${label} ${cloud.label}`,
          ).toBeGreaterThanOrEqual(visible.y)
          expect(
            cloud.position.y,
            `${label} ${cloud.label}`,
          ).toBeLessThanOrEqual(visible.y + visible.height)
        }
        scene.destroy()
      }
    })

    it("getLayoutDiagnostics reports the happy-path contract on all hosts", () => {
      for (const [w, h] of [
        [1920, 1080],
        [1600, 900],
        [1366, 768],
        [1024, 768],
        [2560, 1080],
      ] as const) {
        const app = fakeApp(w, h)
        const scene = createGardenScene(app, { palette: TEST_PALETTE })
        scene.updateLayout(w, h)
        scene.updateSnapshot({
          teams: [team("A", 10), team("B", 8), team("C", 6), team("D", 4)],
        })

        const diag = scene.getLayoutDiagnostics()
        expect(diag.viewport).toEqual({ width: w, height: h })
        expect(diag.plotAnchors).toHaveLength(4)
        expect(diag.plantBoundsLogical).toHaveLength(4)
        expect(diag.allAnchorsInsideVisibleRect).toBe(true)
        expect(diag.allPlantsInsideVisibleRect).toBe(true)
        scene.destroy()
      }
    })

    it("getLayoutDiagnostics stays defensive with a zero-size renderer", () => {
      const app = fakeApp()
      // Zero-size renderer: the initial updateLayout runs on a degenerate
      // viewport before any snapshot — diagnostics must not throw and must
      // report empty (vacuously valid) content.
      const scene = createGardenScene(
        { ...app, renderer: { ...app.renderer, width: 0, height: 0 } },
        { palette: TEST_PALETTE },
      )
      const diag = scene.getLayoutDiagnostics()
      expect(diag.plotAnchors).toEqual([])
      expect(diag.allAnchorsInsideVisibleRect).toBe(true)
      scene.destroy()
    })
  })

  describe("Fluent AssetPlantView production path", () => {
    function makeStageTexture(label: string): Texture {
      return new Texture({ source: Texture.WHITE.source, label })
    }

    function makeSpeciesStages(species: string) {
      return {
        seedling: makeStageTexture(`${species}-seedling`),
        sprout: makeStageTexture(`${species}-sprout`),
        bud: makeStageTexture(`${species}-bud`),
        halfBloom: makeStageTexture(`${species}-half-bloom`),
        fullBloom: makeStageTexture(`${species}-full-bloom`),
      }
    }

    function makeVariants() {
      return {
        violet: makeSpeciesStages("violet"),
        blue: makeSpeciesStages("blue"),
        orange: makeSpeciesStages("orange"),
        green: makeSpeciesStages("green"),
      }
    }

    const FLUENT_PLANT_ALIASES = [
      "plant_shared_seedling",
      "plant_shared_sprout",
      "plant_violet_bud",
      "plant_violet_half",
      "plant_violet_full",
      "plant_blue_bud",
      "plant_blue_half",
      "plant_blue_full",
      "plant_orange_bud",
      "plant_orange_half",
      "plant_orange_full",
      "plant_green_bud",
      "plant_green_half",
      "plant_green_full",
    ] as const

    function makeRegisteredVariants(): PlantVariantTextures {
      const seedling = makeStageTexture("shared-seedling")
      const sprout = makeStageTexture("shared-sprout")
      registerGardenTextureAlias("plant_shared_seedling", seedling)
      registerGardenTextureAlias("plant_shared_sprout", sprout)

      const species = (key: "violet" | "blue" | "orange" | "green") => {
        const bud = makeStageTexture(`${key}-bud`)
        const halfBloom = makeStageTexture(`${key}-half`)
        const fullBloom = makeStageTexture(`${key}-full`)
        registerGardenTextureAlias(`plant_${key}_bud`, bud)
        registerGardenTextureAlias(`plant_${key}_half`, halfBloom)
        registerGardenTextureAlias(`plant_${key}_full`, fullBloom)
        return { seedling, sprout, bud, halfBloom, fullBloom }
      }

      return {
        violet: species("violet"),
        blue: species("blue"),
        orange: species("orange"),
        green: species("green"),
      }
    }

    function makeAssetDiagnostics(): GardenAssetDiagnostics {
      return {
        requiredAliases: [...FLUENT_PLANT_ALIASES],
        loadedAliases: [...FLUENT_PLANT_ALIASES],
        missingAliases: [],
        failedUrls: [],
        fallbackAliases: [],
        usedSpriteAliases: [],
      }
    }

    function makeCompositionAssets() {
      const variants = makeRegisteredVariants()
      const pot = makeStageTexture("shared-pot")
      const face = makeStageTexture("legacy-face")
      registerGardenTextureAlias("plant_pot_01", pot)
      registerGardenTextureAlias("face_emote_happy", face)
      const loadedAliases = [
        ...FLUENT_PLANT_ALIASES,
        "plant_pot_01",
        "face_emote_happy",
      ]
      const diagnostics: GardenAssetDiagnostics = {
        requiredAliases: loadedAliases,
        loadedAliases: [...loadedAliases],
        missingAliases: [],
        failedUrls: [],
        fallbackAliases: [],
        usedSpriteAliases: [],
      }
      return { diagnostics, face, pot, variants }
    }

    it("uses AssetPlantView (no Graphics flower) when plantVariants are provided", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, {
        palette: TEST_PALETTE,
        plantVariants: makeVariants(),
      })
      scene.updateSnapshot({
        teams: [team("A", 5), team("B", 6), team("C", 7), team("D", 8)],
      })
      const identity = scene.getE2EIdentity()
      expect(identity.actorPlants).toHaveLength(4)
      // AssetPlantView roots use full-colour Sprites, never procedural flowers.
      for (const plantRoot of identity.actorPlants) {
        const container = plantRoot as Container
        const labels = container.children.map((c) => c.label)
        expect(labels).toContain("plant-sprite")
        expect(labels).not.toContain("plant-head-graphics")
        expect(labels).not.toContain("plant-stem-graphics")
      }
      scene.destroy()
    })

    describe("HQ pot composition wiring", () => {
      it("mounts pot and body Sprites without face or procedural plant parts", () => {
        const app = fakeApp()
        const { diagnostics, face, pot, variants } = makeCompositionAssets()
        const scene = createGardenScene(app, {
          palette: TEST_PALETTE,
          plantBody: { pot },
          plantHeads: { faceHappy: face },
          plantVariants: variants,
          assetDiagnostics: diagnostics,
        })
        scene.updateSnapshot({
          teams: [team("A", 5), team("B", 5), team("C", 5), team("D", 5)],
        })

        for (const plantRoot of scene.getE2EIdentity().actorPlants) {
          const root = plantRoot as Container
          const potSprite = root.getChildByLabel("plant-pot-sprite")
          const bodySprite = root.getChildByLabel("plant-sprite")
          const spriteLabels = root.children
            .filter((child): child is Sprite => child instanceof Sprite)
            .map((child) => child.label)

          expect(spriteLabels).toEqual(["plant-pot-sprite", "plant-sprite"])
          expect(potSprite).toBeInstanceOf(Sprite)
          expect(bodySprite).toBeInstanceOf(Sprite)
          expect((potSprite as Sprite).texture).toBe(pot)
          expect(potSprite?.visible).toBe(true)
          expect(root.children.indexOf(potSprite!)).toBeLessThan(
            root.children.indexOf(bodySprite!),
          )
          expect(root.children.some((child) => child instanceof Graphics)).toBe(
            false,
          )
          expect(root.getChildByLabel(/face/i, true)).toBeNull()
          expect(root.getChildByLabel("plant-head-graphics", true)).toBeNull()
          expect(root.getChildByLabel("plant-stem-graphics", true)).toBeNull()
          expect(root.getChildByLabel("plant-pot-graphics", true)).toBeNull()
        }
        scene.destroy()
      })

      it("keeps pot identity and plot anchors stable while the body grows", () => {
        const app = fakeApp()
        const { face, pot, variants } = makeCompositionAssets()
        const scene = createGardenScene(app, {
          palette: TEST_PALETTE,
          plantBody: { pot },
          plantHeads: { faceHappy: face },
          plantVariants: variants,
        })
        scene.updateSnapshot({ teams: [team("A", 1), team("B", 1)] })

        const rootsBefore = scene.getE2EIdentity().actorPlants.slice()
        const anchorsBefore = scene.getPlotAnchors().map((anchor) => ({
          x: anchor.x,
          y: anchor.y,
        }))
        const potSprites = rootsBefore.map((plantRoot) =>
          (plantRoot as Container).getChildByLabel("plant-pot-sprite"),
        )
        expect(potSprites.every((sprite) => sprite instanceof Sprite)).toBe(
          true,
        )
        const stablePots = potSprites.filter(
          (sprite): sprite is Sprite => sprite instanceof Sprite,
        )
        const potTransforms = stablePots.map((sprite) => ({
          alpha: sprite.alpha,
          scaleX: sprite.scale.x,
          scaleY: sprite.scale.y,
          visible: sprite.visible,
          x: sprite.position.x,
          y: sprite.position.y,
        }))
        const bodyScalesBefore = rootsBefore.map((plantRoot) => {
          const sprite = (plantRoot as Container).getChildByLabel(
            "plant-sprite",
          ) as Sprite
          return { x: sprite.scale.x, y: sprite.scale.y }
        })

        for (const stage of [5, 8, 10]) {
          scene.updateSnapshot({
            teams: [team("A", stage), team("B", stage)],
          })
        }

        const rootsAfter = scene.getE2EIdentity().actorPlants
        expect(rootsAfter).toEqual(rootsBefore)
        expect(
          scene.getPlotAnchors().map((anchor) => ({
            x: anchor.x,
            y: anchor.y,
          })),
        ).toEqual(anchorsBefore)
        for (let index = 0; index < rootsAfter.length; index += 1) {
          const root = rootsAfter[index]! as Container
          const stablePot = stablePots[index]!
          const body = root.getChildByLabel("plant-sprite") as Sprite
          expect(root.position.x).toBe(anchorsBefore[index]!.x)
          expect(root.position.y).toBe(anchorsBefore[index]!.y)
          expect(root.getChildByLabel("plant-pot-sprite")).toBe(stablePot)
          expect({
            alpha: stablePot.alpha,
            scaleX: stablePot.scale.x,
            scaleY: stablePot.scale.y,
            visible: stablePot.visible,
            x: stablePot.position.x,
            y: stablePot.position.y,
          }).toEqual(potTransforms[index])
          expect({ x: body.scale.x, y: body.scale.y }).not.toEqual(
            bodyScalesBefore[index],
          )
        }
        scene.destroy()
      })

      it("records the visible pot alias once and never records the face alias", () => {
        const app = fakeApp()
        const { diagnostics, face, pot, variants } = makeCompositionAssets()
        const scene = createGardenScene(app, {
          palette: TEST_PALETTE,
          plantBody: { pot },
          plantHeads: { faceHappy: face },
          plantVariants: variants,
          assetDiagnostics: diagnostics,
        })
        scene.updateSnapshot({
          teams: [team("A", 10), team("B", 10), team("C", 10), team("D", 10)],
        })

        expect(
          diagnostics.usedSpriteAliases.filter(
            (alias) => alias === "plant_pot_01",
          ),
        ).toHaveLength(1)
        expect(diagnostics.usedSpriteAliases).not.toContain("face_emote_happy")
        scene.destroy()
      })
    })

    it("maps team slots 0-3 to violet/blue/orange/green species deterministically", () => {
      const app = fakeApp()
      const variants = makeVariants()
      const scene = createGardenScene(app, {
        palette: TEST_PALETTE,
        plantVariants: variants,
      })
      scene.updateSnapshot({
        teams: [team("A", 10), team("B", 10), team("C", 10), team("D", 10)],
      })
      const identity = scene.getE2EIdentity()
      expect(identity.actorPlants).toHaveLength(4)
      expect(identity.growthStages).toEqual([10, 10, 10, 10])
      const actualTextures = identity.actorPlants.map((plantRoot) => {
        const container = plantRoot as Container
        const sprite = container.children.find(
          (child) => child.label === "plant-sprite",
        ) as Sprite
        return sprite.texture
      })
      expect(actualTextures).toEqual([
        variants.violet.fullBloom,
        variants.blue.fullBloom,
        variants.orange.fullBloom,
        variants.green.fullBloom,
      ])
      scene.destroy()
    })

    it("keeps plant root identity stable across stage changes", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, {
        palette: TEST_PALETTE,
        plantVariants: makeVariants(),
      })
      scene.updateSnapshot({ teams: [team("A", 1), team("B", 2)] })
      const before = scene.getE2EIdentity().actorPlants.slice()
      scene.updateSnapshot({ teams: [team("A", 5), team("B", 9)] })
      scene.updateSnapshot({ teams: [team("A", 10), team("B", 10)] })
      const after = scene.getE2EIdentity().actorPlants.slice()
      expect(after).toEqual(before)
      scene.destroy()
    })

    it("2-team and 4-team layouts keep stable plot anchors", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, {
        palette: TEST_PALETTE,
        plantVariants: makeVariants(),
      })
      scene.updateSnapshot({ teams: [team("A", 10), team("B", 10)] })
      const twoAnchors = scene.getPlotAnchors().map((a) => ({ x: a.x, y: a.y }))
      expect(twoAnchors).toHaveLength(2)

      scene.updateSnapshot({
        teams: [team("A", 10), team("B", 10), team("C", 10), team("D", 10)],
      })
      const fourAnchors = scene
        .getPlotAnchors()
        .map((a) => ({ x: a.x, y: a.y }))
      expect(fourAnchors).toHaveLength(4)
      scene.destroy()
    })

    it("falls back to DummyPlantView when plantVariants are absent", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({ teams: [team("A", 5), team("B", 6)] })
      const identity = scene.getE2EIdentity()
      // DummyPlantView roots carry the graphics labels.
      const first = identity.actorPlants[0] as Container
      const labels = first.children.map((c) => c.label)
      expect(labels).toContain("plant-stem-graphics")
      scene.destroy()
    })

    it("falls back only the incomplete species while preserving complete variants", () => {
      const app = fakeApp()
      const variants = makeRegisteredVariants()
      delete variants.green
      const scene = createGardenScene(app, {
        palette: TEST_PALETTE,
        plantVariants: variants,
      })
      scene.updateSnapshot({
        teams: [team("A", 10), team("B", 10), team("C", 10), team("D", 10)],
      })

      const roots = scene.getE2EIdentity().actorPlants as Container[]
      for (const root of roots.slice(0, 3)) {
        expect(root.children.map((child) => child.label)).toContain(
          "plant-sprite",
        )
      }
      expect(roots[3]!.children.map((child) => child.label)).toContain(
        "plant-stem-graphics",
      )
      scene.destroy()
    })

    it("separates loaded aliases from visible runtime use and accumulates all 14", () => {
      const app = fakeApp()
      const diagnostics = makeAssetDiagnostics()
      const scene = createGardenScene(app, {
        palette: TEST_PALETTE,
        plantVariants: makeRegisteredVariants(),
        assetDiagnostics: diagnostics,
      })

      expect(diagnostics.loadedAliases).toHaveLength(14)
      expect(diagnostics.usedSpriteAliases).toEqual([])

      // 1→5→8→10 genuinely selects 13 assets. Sprout is not used by those
      // stages, so truthful diagnostics must not claim it yet.
      for (const stage of [1, 5, 8, 10]) {
        scene.updateSnapshot({
          teams: [
            team("A", stage),
            team("B", stage),
            team("C", stage),
            team("D", stage),
          ],
        })
      }
      expect(diagnostics.usedSpriteAliases).not.toContain("plant_shared_sprout")
      expect(diagnostics.usedSpriteAliases).toHaveLength(13)

      // Stage 2 is required to select the shared sprout and complete all 14.
      scene.updateSnapshot({
        teams: [team("A", 2), team("B", 2), team("C", 2), team("D", 2)],
      })
      expect(new Set(diagnostics.usedSpriteAliases)).toEqual(
        new Set(FLUENT_PLANT_ALIASES),
      )
      expect(diagnostics.usedSpriteAliases).not.toContain("plant_head_round")
      expect(diagnostics.usedSpriteAliases).not.toContain("plant_stem_01")
      scene.destroy()
    })

    it("reports transition readiness from actual visible sprite state", () => {
      const app = fakeApp()
      const ticks: Array<(ticker: { deltaTime: number }) => void> = []
      Object.assign(app.ticker, {
        add: (fn: (ticker: { deltaTime: number }) => void) => ticks.push(fn),
        remove: (fn: (ticker: { deltaTime: number }) => void) => {
          const index = ticks.indexOf(fn)
          if (index >= 0) ticks.splice(index, 1)
        },
      })
      const scene = createGardenScene(app, {
        palette: TEST_PALETTE,
        plantVariants: makeRegisteredVariants(),
      })
      scene.updateSnapshot({ teams: [team("A", 5), team("B", 5)] })
      expect(scene.arePlantTransitionsSettled()).toBe(false)

      let frames = 0
      while (!scene.arePlantTransitionsSettled() && frames < 30) {
        ticks[0]!({ deltaTime: 1 })
        frames += 1
      }
      expect(frames).toBeGreaterThan(7)
      expect(scene.arePlantTransitionsSettled()).toBe(true)
      scene.destroy()
      expect(ticks).toHaveLength(0)
    })
  })
})

describe("FU-I: sky-life foreground layer (birds above distant hills, below trees)", () => {
  it("adds layer-sky-life-foreground to LAYER_LABELS between distant-bushes and grass", () => {
    // LAYER_LABELS must have grown by exactly 1 (the new foreground layer).
    const labels = [...LAYER_LABELS]
    const bushesIdx = labels.indexOf("layer-distant-bushes")
    const grassIdx = labels.indexOf("layer-grass")
    const foregroundIdx = labels.indexOf("layer-sky-life-foreground")
    expect(bushesIdx).toBeGreaterThanOrEqual(0)
    expect(grassIdx).toBeGreaterThanOrEqual(0)
    expect(foregroundIdx).toBeGreaterThanOrEqual(0)
    // Strict order: … distant-bushes → sky-life-foreground → grass …
    expect(foregroundIdx).toBe(bushesIdx + 1)
    expect(foregroundIdx).toBeLessThan(grassIdx)
  })

  it("createGardenLayers exposes skyLifeForeground, ordered between distant-bushes and grass", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })

    // The layer is exposed on the GardenLayerSet.
    expect(scene.layers.skyLifeForeground).toBeDefined()
    expect(scene.layers.skyLifeForeground.label).toBe("layer-sky-life-foreground")
    expect(scene.layers.skyLifeForeground.children).toHaveLength(0)

    // Ordered children mirror LAYER_LABELS (existing test contract).
    expect(scene.root.children.map((c) => c.label)).toEqual([...LAYER_LABELS])
    expect(scene.layers.ordered.map((l) => l.label)).toEqual([...LAYER_LABELS])

    // Strict ordering of the new layer between distant-bushes and grass.
    const ordered = scene.layers.ordered.map((l) => l.label)
    const bushesIdx = ordered.indexOf("layer-distant-bushes")
    const foregroundIdx = ordered.indexOf("layer-sky-life-foreground")
    const grassIdx = ordered.indexOf("layer-grass")
    expect(foregroundIdx).toBe(bushesIdx + 1)
    expect(foregroundIdx).toBeLessThan(grassIdx)

    // The base layer-sky-life (behind distant-hills) is still present.
    expect(ordered.indexOf("layer-sky-life")).toBeGreaterThanOrEqual(0)
    expect(ordered.indexOf("layer-distant-hills")).toBeGreaterThan(
      ordered.indexOf("layer-sky-life"),
    )

    scene.destroy()
  })
})

describe("atmosphere safe zones wiring (Minor-5 / FU-C)", () => {
  it("safeZones mirrors the plot count (2 → 3 → 4 teams) and centers match anchors", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, {
      palette: TEST_PALETTE,
      atmosphere: { seed: 1234 },
    })
    scene.updateLayout(1920, 1080)

    // Pre-snapshot: no anchors, safeZones is empty.
    expect(scene.getAtmosphereSafeZones()).toEqual([])

    // 2 teams — first rebuild populates anchors + safeZones in lock-step.
    scene.updateSnapshot({ teams: [team("A", 5), team("B", 5)] })
    let zones = scene.getAtmosphereSafeZones()
    let anchors = scene.getPlotAnchors()
    expect(zones).toHaveLength(2)
    expect(anchors).toHaveLength(2)
    for (let i = 0; i < 2; i += 1) {
      expect(zones[i]!.x).toBe(anchors[i]!.x)
      expect(zones[i]!.y).toBe(anchors[i]!.y)
    }

    // 3 teams — rebuild replaces the list, not a stale reference.
    scene.updateSnapshot({
      teams: [team("A", 5), team("B", 5), team("C", 5)],
    })
    zones = scene.getAtmosphereSafeZones()
    anchors = scene.getPlotAnchors()
    expect(zones).toHaveLength(3)
    expect(anchors).toHaveLength(3)
    for (let i = 0; i < 3; i += 1) {
      expect(zones[i]!.x).toBe(anchors[i]!.x)
      expect(zones[i]!.y).toBe(anchors[i]!.y)
    }

    // 4 teams — the spec endpoint (Minor-5 followup brief).
    scene.updateSnapshot({
      teams: [team("A", 5), team("B", 5), team("C", 5), team("D", 5)],
    })
    zones = scene.getAtmosphereSafeZones()
    anchors = scene.getPlotAnchors()
    expect(zones).toHaveLength(4)
    expect(anchors).toHaveLength(4)
    for (let i = 0; i < 4; i += 1) {
      expect(zones[i]!.x).toBe(anchors[i]!.x)
      expect(zones[i]!.y).toBe(anchors[i]!.y)
      // Rectangle is non-zero so the bird controller's pickSafeDestination
      // check has a real footprint to reject.
      expect(zones[i]!.width).toBeGreaterThan(0)
      expect(zones[i]!.height).toBeGreaterThan(0)
    }

    scene.destroy()
  })

  it("keeps a fresh safeZones list on every team-count change", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, {
      palette: TEST_PALETTE,
      atmosphere: { seed: 1234 },
    })
    scene.updateLayout(1920, 1080)

    scene.updateSnapshot({ teams: [team("A", 5), team("B", 5)] })
    const twoZones = scene.getAtmosphereSafeZones()
    expect(twoZones).toHaveLength(2)

    scene.updateSnapshot({
      teams: [team("A", 5), team("B", 5), team("C", 5), team("D", 5)],
    })
    const fourZones = scene.getAtmosphereSafeZones()
    expect(fourZones).toHaveLength(4)
    // The list is rebuilt — not the same array reference.
    expect(fourZones).not.toBe(twoZones)

    scene.destroy()
  })

  it("safeZones tracks the anchors even when no atmosphere was bound (legacy path)", () => {
    const app = fakeApp()
    const scene = createGardenScene(app, { palette: TEST_PALETTE })
    scene.updateLayout(1920, 1080)
    scene.updateSnapshot({ teams: [team("A", 5), team("B", 5)] })
    // Mirrors the brief literally — rebuild re-derives safeZones from
    // anchors; the value is exposed unconditionally as a test hook.
    expect(scene.getPlotAnchors()).toHaveLength(2)
    const zones = scene.getAtmosphereSafeZones()
    expect(zones).toHaveLength(2)
    const anchors = scene.getPlotAnchors()
    for (let i = 0; i < 2; i += 1) {
      expect(zones[i]!.x).toBe(anchors[i]!.x)
      expect(zones[i]!.y).toBe(anchors[i]!.y)
    }
    scene.destroy()
  })
})
