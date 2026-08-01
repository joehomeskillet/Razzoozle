/**
 * WP-PIX-05A GardenScene contract tests.
 * Node env + real Pixi Containers/Graphics (no WebGL Application required).
 */

import { Container, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

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

  describe("team HUD under plants (presenterHud)", () => {
    it("mounts one team-hud per team with name label + growth meter", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({
        teams: [team("Violet", 3), team("Orange", 7)],
        phase: "question",
      })

      const huds = scene.layers.presenterHud.children.filter(
        (c) => typeof c.label === "string" && c.label.startsWith("team-hud-"),
      )
      expect(huds).toHaveLength(2)
      expect(huds[0]!.label).toBe("team-hud-0")
      expect(huds[1]!.label).toBe("team-hud-1")

      // Label text is nested: team-hud → team-hud-label → team-hud-label-text
      for (let i = 0; i < 2; i += 1) {
        const hud = huds[i]! as Container
        const label = hud.children.find((c) => c.label === "team-hud-label")
        expect(label).toBeDefined()
        const meter = hud.children.find((c) => c.label === "team-hud-meter")
        expect(meter).toBeDefined()
        const textNode = (label as Container).children.find(
          (c) => c.label === "team-hud-label-text",
        ) as { text?: string } | undefined
        expect(textNode?.text).toBe(i === 0 ? "Violet" : "Orange")
      }

      // HUD sits under the plant anchor (buildTeamHud offsets y by +56).
      const anchors = scene.getPlotAnchors()
      expect(huds[0]!.position.x).toBe(anchors[0]!.x)
      expect(huds[0]!.position.y).toBe(anchors[0]!.y + 56)
      expect(huds[1]!.position.x).toBe(anchors[1]!.x)
      expect(huds[1]!.position.y).toBe(anchors[1]!.y + 56)

      scene.destroy()
    })

    it("updates growth meters and names without recreating plant instances", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2)],
      })
      const plantsBefore = scene.layers.actors.children.slice()
      const hudBefore = scene.layers.presenterHud.children
        .filter(
          (c) => typeof c.label === "string" && c.label.startsWith("team-hud-"),
        )
        .slice()

      scene.updateSnapshot({
        teams: [team("Alpha", 9), team("Beta", 10)],
      })

      // Plants stay identity-stable; HUD widgets are rebuilt for new meters/names.
      expect(scene.layers.actors.children).toEqual(plantsBefore)
      const hudAfter = scene.layers.presenterHud.children.filter(
        (c) => typeof c.label === "string" && c.label.startsWith("team-hud-"),
      )
      expect(hudAfter).toHaveLength(2)
      expect(hudAfter[0]).not.toBe(hudBefore[0])
      expect(hudAfter[1]).not.toBe(hudBefore[1])

      const label0 = (hudAfter[0] as Container).children.find(
        (c) => c.label === "team-hud-label",
      ) as Container
      const text0 = label0.children.find(
        (c) => c.label === "team-hud-label-text",
      ) as { text?: string }
      expect(text0.text).toBe("Alpha")

      scene.destroy()
    })

    it("trims HUDs when team count shrinks and cleans them on destroy", () => {
      const app = fakeApp()
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateSnapshot({
        teams: [team("A", 1), team("B", 2), team("C", 3)],
      })
      expect(
        scene.layers.presenterHud.children.filter((c) =>
          String(c.label).startsWith("team-hud-"),
        ),
      ).toHaveLength(3)

      scene.updateSnapshot({
        teams: [team("A", 4), team("B", 5)],
      })
      expect(
        scene.layers.presenterHud.children.filter((c) =>
          String(c.label).startsWith("team-hud-"),
        ),
      ).toHaveLength(2)

      scene.destroy()
      // Root (and presenterHud) destroyed — stage no longer holds the scene.
      expect(app.stage.children).not.toContain(scene.root)
    })

    it("repositions HUDs with anchors on cover-crop resize", () => {
      const app = fakeApp(1920, 1080)
      const scene = createGardenScene(app, { palette: TEST_PALETTE })
      scene.updateLayout(1920, 1080)
      scene.updateSnapshot({
        teams: [team("A", 3), team("B", 3)],
      })
      const hud16 = scene.layers.presenterHud.children.find(
        (c) => c.label === "team-hud-0",
      )!
      const x16 = hud16.position.x

      scene.updateLayout(1024, 768)
      const hud4 = scene.layers.presenterHud.children.find(
        (c) => c.label === "team-hud-0",
      )!
      const anchors = scene.getPlotAnchors()
      expect(hud4.position.x).toBe(anchors[0]!.x)
      expect(hud4.position.y).toBe(anchors[0]!.y + 56)
      // On 4:3 the visible band crops left/right so anchors (and HUDs) move.
      expect(hud4.position.x).not.toBe(x16)

      scene.destroy()
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
          expect(cloud.position.x, `${label} ${cloud.label}`).toBeGreaterThanOrEqual(
            visible.x,
          )
          expect(
            cloud.position.x,
            `${label} ${cloud.label}`,
          ).toBeLessThanOrEqual(visible.x + visible.width)
          expect(cloud.position.y, `${label} ${cloud.label}`).toBeGreaterThanOrEqual(
            visible.y,
          )
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
})
