/**
 * Dev-only garden preview for visual acceptance of the asset pipeline.
 * Open via Vite: /garden-preview.html?teams=2|4
 *
 * Production path: attachGardenPixiApplication loads textures and
 * createGardenScene wires layer sprites + team HUD under each plot.
 */

import { attachGardenPixiApplication } from "../experiences/flower-battle/attachGardenPixiApplication"
import type { ProceduralGardenScene } from "../experiences/flower-battle/rendering/GardenScene"

function readTeamCount(): number {
  try {
    const n = Number(new URLSearchParams(location.search).get("teams") ?? "4")
    if (!Number.isFinite(n)) return 4
    return Math.min(4, Math.max(2, Math.floor(n)))
  } catch {
    return 4
  }
}

/** Uniform growth stage override for screenshot gates (?stage=0..10). */
function readGrowthStage(): number | null {
  try {
    const raw = new URLSearchParams(location.search).get("stage")
    if (raw == null || raw === "") return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return Math.min(10, Math.max(0, Math.floor(n)))
  } catch {
    return null
  }
}

function teamSnapshots(count: number, stage: number | null) {
  const names = ["Violett", "Blau", "Orange", "Grün"]
  // Growth spread across 0..MAX_GROWTH(=10) — matches live experience range.
  const growth = [2, 6, 10, 8]
  return Array.from({ length: count }, (_, i) => ({
    name: names[i] ?? `Team ${i + 1}`,
    growthStage: stage ?? growth[i] ?? 6,
  }))
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/**
 * All five macro stages must be selected to prove all 14 Fluent aliases.
 * Stage 2 is required: stages 2–4 are the only users of shared sprout.
 */
export const PREVIEW_PLANT_DIAGNOSTIC_STAGES = [1, 2, 5, 8, 10] as const

async function waitForPlantTransitions(
  procedural: ProceduralGardenScene,
  maxFrames = 120,
): Promise<void> {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (procedural.arePlantTransitionsSettled()) return
    await nextFrame()
  }
  throw new Error(`plant transition did not settle within ${maxFrames} frames`)
}

function countSceneTeamHuds(procedural: ProceduralGardenScene): number {
  const layer = procedural.layers?.presenterHud
  if (!layer?.children) return 0
  return layer.children.filter(
    (c) => typeof c.label === "string" && c.label.startsWith("team-hud-"),
  ).length
}

async function main(): Promise<void> {
  const canvas = document.getElementById("garden") as HTMLCanvasElement | null
  const status = document.getElementById("status")
  if (!canvas) {
    throw new Error("garden canvas missing")
  }

  const teamCount = readTeamCount()
  const stageOverride = readGrowthStage()
  status && (status.textContent = `init Pixi… teams=${teamCount}`)

  const { scene, dispose, prefersReducedMotion } =
    await attachGardenPixiApplication(canvas)
  const procedural = scene as ProceduralGardenScene

  // Debug handles for automated layout verification (read-only, dev-only).
  ;(window as Window & { __gardenScene?: unknown }).__gardenScene = procedural
  // Mirror the GardenBattleCanvasHost E2E probe so diagnostics work here too.
  if (typeof procedural.getE2EIdentity === "function") {
    Object.defineProperty(canvas, "__razzoozleGardenE2E", {
      configurable: true,
      enumerable: false,
      value: {
        getE2EIdentity: () => procedural.getE2EIdentity(),
        getLayoutDiagnostics: () => procedural.getLayoutDiagnostics(),
      },
    })
  }

  // Force a full-size layout pass so anchors match the canvas client size.
  if (typeof procedural.updateLayout === "function") {
    procedural.updateLayout(
      Math.max(1, canvas.clientWidth || 1920),
      Math.max(1, canvas.clientHeight || 1080),
    )
  }

  // Exercise every macro texture through the real production view. Diagnostics
  // accumulate only aliases selected by visible Sprites; final snapshot below
  // restores the requested visual fixture before declaring screenshot-ready.
  for (const stage of PREVIEW_PLANT_DIAGNOSTIC_STAGES) {
    procedural.updateSnapshot({
      teams: teamSnapshots(teamCount, stage),
      phase: "preview-diagnostics",
    })
    await waitForPlantTransitions(procedural)
  }

  const teams = teamSnapshots(teamCount, stageOverride)
  procedural.updateSnapshot({ teams, phase: "preview" })
  await waitForPlantTransitions(procedural)
  await nextFrame()

  const hudMounted = countSceneTeamHuds(procedural)

  const diag = procedural.assetDiagnostics
  const winDiag = (
    window as Window & {
      __razzoozleGardenAssets?: {
        loadedAliases?: string[]
        missingAliases?: string[]
        usedSpriteAliases?: string[]
        failedUrls?: string[]
      }
    }
  ).__razzoozleGardenAssets

  const loaded =
    diag?.loadedAliases?.length ?? winDiag?.loadedAliases?.length ?? 0
  const missing = diag?.missingAliases ?? winDiag?.missingAliases ?? []
  const used = diag?.usedSpriteAliases ?? winDiag?.usedSpriteAliases ?? []
  const failed = diag?.failedUrls ?? winDiag?.failedUrls ?? []
  const layout = procedural.getLayoutDiagnostics()

  const readyPayload = {
    teams: teamCount,
    stage: stageOverride,
    reducedMotion: prefersReducedMotion,
    loaded,
    sprites: used.length,
    missing: missing.length,
    failed: failed.length,
    hudMounted,
    anchorsInside: layout.allAnchorsInsideVisibleRect,
    plantsInside: layout.allPlantsInsideVisibleRect,
    diagnosticStages: [...PREVIEW_PLANT_DIAGNOSTIC_STAGES],
    usedSpriteAliases: [...used],
  }

  if (status) {
    status.textContent = [
      `teams=${teamCount}`,
      `stage=${stageOverride ?? "mixed"}`,
      `reducedMotion=${prefersReducedMotion}`,
      `loaded=${loaded}`,
      `sprites=${used.length}`,
      `hud=${hudMounted}`,
      `missing=${missing.length ? missing.join(",") : "none"}`,
      `failed=${failed.length}`,
      `anchorsInside=${layout.allAnchorsInsideVisibleRect}`,
      `plantsInside=${layout.allPlantsInsideVisibleRect}`,
    ].join("\n")
  }

  // Ready flag for Playwright screenshot gate.
  const win = window as Window & {
    __gardenPreviewReady?: boolean
    __gardenPreviewDiag?: typeof readyPayload
    __gardenDispose?: () => void
  }
  win.__gardenPreviewDiag = readyPayload
  win.__gardenPreviewReady = true
  win.__gardenDispose = dispose
}

main().catch((err) => {
  const status = document.getElementById("status")
  if (status) {
    status.textContent = `ERROR: ${err instanceof Error ? err.message : String(err)}`
  }
  console.error(err)
  ;(
    window as Window & { __gardenPreviewReady?: boolean }
  ).__gardenPreviewReady = false
})
