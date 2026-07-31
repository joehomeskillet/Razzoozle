/**
 * Flower Battle presenter performance benchmark (WP-PRESENTER-7 / W9-7).
 *
 * Measures load, draw, and update cost of the procedural PixiJS garden scene
 * (createGardenScene + updateSnapshot) using a structural fake Application
 * so it runs under the project's node env without WebGL. Metrics are stable
 * enough to compare commit-to-commit (`runBench("before")` vs
 * `runBench("after")`); they are NOT a substitute for an in-browser
 * Chrome-DevTools performance trace.
 *
 * Usage:
 *   pnpm --filter @razzoozle/web bench:perf             # default: after
 *   node ... performanceBench.ts after                   # explicit scenario
 *   node ... performanceBench.ts before 910242899        # git-rev stamp
 *
 * Writes JSON to bench/output/bench-result-{scenario}.json.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"

import { Container } from "pixi.js"

import { createGardenScene } from "../rendering/GardenScene"
import type {
  GardenSceneSnapshot,
  ProceduralGardenScene,
} from "../rendering/GardenScene"
import type { GardenPixiApplicationHandle } from "../garden-pixi.types"

export type BenchScenario = "before" | "after"

export interface BenchMetrics {
  /** Wall time of scene construction (createGardenScene) in ms. */
  loadMs: number
  /** Sum of updateSnapshot call times across the full tick batch in ms. */
  updateMs: number
  /** Average per-call updateSnapshot cost in ms (0 when 0 calls). */
  updateMsPerCall: number
  /** Number of updateSnapshot calls issued in the bench loop. */
  updateCalls: number
  /** Resize handling: total time across N viewport mutations in ms. */
  resizeMs: number
  /** Resize handling: average per-call updateLayout in ms. */
  resizeMsPerCall: number
  /** Total Container nodes in the scene graph after load. */
  containerCount: number
  /** Total Graphics nodes (drawables) in the scene graph after load. */
  graphicsCount: number
  /** Total Sprite/Texture-bearing nodes after load (0 in procedural scene). */
  spriteCount: number
  /** Sum of containerCount + graphicsCount + spriteCount. */
  drawCallEstimate: number
  /** Same drawCallEstimate after a VFX burst (high-growth snapshot). */
  vfxDrawCallEstimate: number
  /** Delta drawCalls (VFX - idle) — higher = more burst cost. */
  vfxDeltaDrawCalls: number
  /** Estimated texture / atlas bytes consumed (deterministic per-node est). */
  estimatedTextureBytes: number
  /**
   * Frames-per-second estimate: updateSnapshot calls per second over the
   * bench loop (no ticker wall-time, pure compute throughput).
   */
  estimatedFps: number
  /**
   * Heap delta in bytes if `performance.memory` is available; otherwise null.
   * Only meaningful in Chromium-style runtimes.
   */
  memoryDeltaBytes: number | null
}

export interface BenchResult {
  scenario: BenchScenario
  /** Stamp provided by the runner (e.g. git SHA) — "" when omitted. */
  commit: string
  /** ISO-8601 timestamp of the run. */
  ranAt: string
  metrics: BenchMetrics
}

const TICK_COUNT = 240
const RESIZE_COUNT = 8
const TEAM_COUNT = 4
const RENDER_WIDTH = 1280
const RENDER_HEIGHT = 720
const OUTPUT_RELATIVE = "bench/output"

/**
 * Per-node byte estimate for atlas/texture accounting. Tuned to the
 * procedural garden (every drawable is a `Graphics` batched on a small
 * palette). Sprites dominate when present, Containers are bookkeeping only.
 */
const BYTES_PER_GRAPHICS = 512
const BYTES_PER_SPRITE = 4096
const BYTES_PER_CONTAINER = 64

function readMemoryUsage(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } })
    .memory
  if (!memory || typeof memory.usedJSHeapSize !== "number") return null
  return memory.usedJSHeapSize
}

function buildSnapshot(phase: "idle" | "vfx", tick: number): GardenSceneSnapshot {
  return {
    phase,
    teams: Array.from({ length: TEAM_COUNT }, (_, index) => ({
      name: `Team ${index + 1}`,
      // VFX phase pushes growth to max so plant geometry mutates mid-bench.
      growthStage: phase === "vfx" ? 10 : Math.min(10, (tick + index) % 11),
    })),
  }
}

/**
 * Structural Application fake: enough surface for `createGardenScene` and
 * `updateLayout` to run in node. The scene only touches `stage` + `renderer`
 * dimensions; ticker / canvas are inert.
 */
function createBenchApplication(): GardenPixiApplicationHandle {
  const stage = new Container()
  stage.label = "bench-stage"
  return {
    canvas: {
      clientWidth: RENDER_WIDTH,
      clientHeight: RENDER_HEIGHT,
    } as unknown as HTMLCanvasElement,
    renderer: {
      resize: () => undefined,
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
    },
    stage,
    ticker: { start: () => undefined, stop: () => undefined },
    destroy: () => undefined,
  }
}

function countSceneNodes(scene: ProceduralGardenScene): {
  containerCount: number
  graphicsCount: number
  spriteCount: number
} {
  // BFS through the real scene graph (real PixiJS Container/Graphics in
  // node env, structural-only — no GL state). Cast to a small duck-typed
  // shape so the bench never imports the heavy pixi.js types.
  let containerCount = 0
  let graphicsCount = 0
  let spriteCount = 0
  const queue: unknown[] = [scene.root]
  const seen = new WeakSet<object>()
  while (queue.length > 0) {
    const node = queue.shift() as {
      constructor?: { name?: string }
      children?: unknown[]
    }
    if (!node || typeof node !== "object") continue
    const target = node as object
    if (seen.has(target)) continue
    seen.add(target)
    const ctorName = node.constructor?.name ?? ""
    if (ctorName === "Container") {
      containerCount += 1
    } else if (ctorName === "Graphics") {
      graphicsCount += 1
    } else if (ctorName === "Sprite") {
      spriteCount += 1
    }
    if (Array.isArray(node.children)) {
      queue.push(...node.children)
    }
  }
  return { containerCount, graphicsCount, spriteCount }
}

function estimateBytes(counts: {
  containerCount: number
  graphicsCount: number
  spriteCount: number
}): number {
  return (
    counts.containerCount * BYTES_PER_CONTAINER +
    counts.graphicsCount * BYTES_PER_GRAPHICS +
    counts.spriteCount * BYTES_PER_SPRITE
  )
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function outputPath(scenario: BenchScenario): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return `${here}/${OUTPUT_RELATIVE}/bench-result-${scenario}.json`
}

/**
 * Runs the benchmark against the *currently compiled* procedural scene and
 * returns the measurement. Intentionally non-throwing — bench output should
 * land on disk even when individual sub-measurements fail to record a value.
 */
export async function runBench(
  scenario: BenchScenario,
  commit: string = "",
): Promise<BenchResult> {
  const startMemory = readMemoryUsage()

  // --- Load: createGardenScene is the dominant init cost.
  const loadStart = performance.now()
  const app = createBenchApplication()
  const scene = createGardenScene(app) as ProceduralGardenScene
  const loadMs = performance.now() - loadStart

  // Warm the JIT so the first updateSnapshot doesn't dominate the sample.
  for (let i = 0; i < 8; i += 1) {
    scene.updateSnapshot(buildSnapshot("idle", i))
  }

  // --- Update loop: simulate a busy 4-team phase with growth progression.
  const updateStart = performance.now()
  for (let tick = 0; tick < TICK_COUNT; tick += 1) {
    scene.updateSnapshot(buildSnapshot("idle", tick))
  }
  const updateMs = performance.now() - updateStart

  // --- Resize loop: drive updateLayout across N viewports.
  const resizeStart = performance.now()
  const viewports: ReadonlyArray<readonly [number, number]> = [
    [1280, 720],
    [1024, 640],
    [820, 540],
    [640, 480],
    [480, 360],
    [375, 667],
    [414, 736],
    [768, 540],
  ]
  for (let i = 0; i < RESIZE_COUNT; i += 1) {
    const [width, height] = viewports[i] ?? [800, 600]
    scene.updateLayout(width, height)
  }
  const resizeMs = performance.now() - resizeStart

  // --- Idle draw counts (post-update).
  const idleCounts = countSceneNodes(scene)

  // --- VFX burst draw counts.
  scene.updateSnapshot(buildSnapshot("vfx", 0))
  const vfxCounts = countSceneNodes(scene)

  // --- FPS estimate: pure compute throughput over the update phase.
  const updateCalls = TICK_COUNT
  const estimatedFps =
    updateMs > 0 ? Math.round((updateCalls * 1000) / updateMs) : 0

  // --- Memory delta (only when `performance.memory` is exposed).
  const endMemory = readMemoryUsage()
  const memoryDeltaBytes =
    startMemory !== null && endMemory !== null ? endMemory - startMemory : null

  // --- Cleanup.
  scene.destroy()

  const drawCallEstimate =
    idleCounts.containerCount +
    idleCounts.graphicsCount +
    idleCounts.spriteCount
  const vfxDrawCallEstimate =
    vfxCounts.containerCount + vfxCounts.graphicsCount + vfxCounts.spriteCount

  const result: BenchResult = {
    scenario,
    commit,
    ranAt: new Date().toISOString(),
    metrics: {
      loadMs: roundTo(loadMs, 3),
      updateMs: roundTo(updateMs, 3),
      updateMsPerCall: roundTo(updateMs / updateCalls, 4),
      updateCalls,
      resizeMs: roundTo(resizeMs, 3),
      resizeMsPerCall: roundTo(resizeMs / RESIZE_COUNT, 4),
      containerCount: idleCounts.containerCount,
      graphicsCount: idleCounts.graphicsCount,
      spriteCount: idleCounts.spriteCount,
      drawCallEstimate,
      vfxDrawCallEstimate,
      vfxDeltaDrawCalls: vfxDrawCallEstimate - drawCallEstimate,
      estimatedTextureBytes: estimateBytes(idleCounts),
      estimatedFps,
      memoryDeltaBytes,
    },
  }

  const target = outputPath(scenario)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return result
}

function parseCli(argv: readonly string[]): {
  scenario: BenchScenario
  commit: string
} {
  const scenarioArg = argv.find(
    (a): a is BenchScenario => a === "before" || a === "after",
  )
  const scenario: BenchScenario = scenarioArg ?? "after"
  // Anything else is treated as a free-form commit stamp.
  const commit = argv.find((a) => a !== "before" && a !== "after") ?? ""
  return { scenario, commit }
}

async function main(): Promise<void> {
  const { scenario, commit } = parseCli(process.argv.slice(2))
  const result = await runBench(scenario, commit)
  // eslint-disable-next-line no-console -- bench CLI output, intentional
  console.log(
    `[bench:${scenario}] commit=${result.commit || "n/a"} ` +
      `load=${result.metrics.loadMs}ms ` +
      `update=${result.metrics.updateMs}ms ` +
      `drawCalls(idle/vfx)=${result.metrics.drawCallEstimate}/` +
      `${result.metrics.vfxDrawCallEstimate} ` +
      `fps=${result.metrics.estimatedFps} ` +
      `bytes=${result.metrics.estimatedTextureBytes}`,
  )
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  main().catch((error) => {
    // eslint-disable-next-line no-console -- intentional CLI exit handler
    console.error("[bench] failed:", error)
    process.exitCode = 1
  })
}
