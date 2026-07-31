/**
 * WP-PIX-05A GardenScene contract tests.
 * Node env + real Pixi Containers/Graphics (no WebGL Application required).
 */

import { Container } from "pixi.js"
import { describe, expect, it } from "vitest"

import type { GardenPixiApplicationHandle } from "../../garden-pixi.types"
import { createGardenScene, LAYER_LABELS } from "../GardenScene"
import type { GardenPalette } from "../gardenPalette"
import { computePlotAnchors } from "../plotAnchors"
import {
  ThemeTokenColorError,
  THEME_TOKEN_COLOR_ERROR,
} from "../resolveThemeColor"

/** Deterministic palette — test-only injection, not production fallback. */
const TEST_PALETTE: GardenPalette = {
  sky: 0x87b5e0,
  hillsFar: 0x4a8f4a,
  hillsNear: 0x5aad5a,
  clouds: 0xf5f5f5,
  midground: 0x3d7a3d,
  soil: 0xc4a574,
  soilEdge: 0x8b6914,
  foreground: 0x2f6b2f,
  plantStem: 0x2d6a2d,
  plantLeaf: 0x4caf50,
  plantPetal: 0xe57373,
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

      const expected = computePlotAnchors(teams)
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
})
