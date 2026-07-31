/**
 * Dev-only garden preview for visual acceptance of the asset pipeline.
 * Open via Vite: /garden-preview.html?teams=2|4
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

function teamSnapshots(count: number) {
  const names = ["Violett", "Blau", "Orange", "Grün"]
  // Growth 0..10 — spread across stages so heads read clearly.
  const growth = [2, 5, 8, 10]
  return Array.from({ length: count }, (_, i) => ({
    name: names[i] ?? `Team ${i + 1}`,
    growthStage: growth[i] ?? 6,
  }))
}

async function main(): Promise<void> {
  const canvas = document.getElementById("garden") as HTMLCanvasElement | null
  const status = document.getElementById("status")
  if (!canvas) {
    throw new Error("garden canvas missing")
  }

  const teamCount = readTeamCount()
  status && (status.textContent = `init Pixi… teams=${teamCount}`)

  const { scene, dispose } = await attachGardenPixiApplication(canvas)
  const procedural = scene as ProceduralGardenScene
  if (typeof procedural.updateSnapshot === "function") {
    procedural.updateSnapshot({
      teams: teamSnapshots(teamCount),
      phase: "preview",
    })
  }

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

  const loaded = diag?.loadedAliases?.length ?? winDiag?.loadedAliases?.length ?? 0
  const missing = diag?.missingAliases ?? winDiag?.missingAliases ?? []
  const used = diag?.usedSpriteAliases ?? winDiag?.usedSpriteAliases ?? []
  const failed = diag?.failedUrls ?? winDiag?.failedUrls ?? []

  if (status) {
    status.textContent = [
      `teams=${teamCount}`,
      `loaded=${loaded}`,
      `sprites=${used.length}`,
      `missing=${missing.length ? missing.join(",") : "none"}`,
      `failed=${failed.length}`,
    ].join("\n")
  }

  // Keep dispose reachable for manual teardown in console.
  ;(window as Window & { __gardenDispose?: () => void }).__gardenDispose =
    dispose
}

main().catch((err) => {
  const status = document.getElementById("status")
  if (status) {
    status.textContent = `ERROR: ${err instanceof Error ? err.message : String(err)}`
  }
  console.error(err)
})
