/**
 * Visual-Regression Suite (WP-PRESENTER-8 / SDD §11).
 *
 * Runs 11 Pflicht-Fixtures × 5 Viewports = 55 regression tests. Each test:
 *   1. Renders the presenter mock via renderFixtureHtml (deterministic).
 *   2. Computes the structural FNV-1a hash.
 *   3. Asserts the SDD §11.3 False-PASS-Schutz.
 *   4. Compares the hash against a baseline file. Missing baseline →
 *      auto-written (initial commit). Mismatch → FAIL with a diagnostic
 *      including the markup excerpt + measured plant heights / plot counts.
 *
 * Baseline updates are explicitly owner-gated: setting
 * OWNER_APPROVE_VISUAL_BASELINE_UPDATE=1 lets a maintainer refresh baselines
 * after a deliberate visual change. No tolerance inflation path.
 *
 * Runs in node env. Presenter mock is rendered through deterministic string
 * assembly (no DOM needed — jsdom/happy-dom are not installed and adding
 * them is forbidden by the WP).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  VISUAL_FIXTURES,
  VISUAL_VIEWPORTS,
  type FixtureId,
  type ViewportId,
} from "./visualFixtures"
import { renderFixtureHtml, measureFixtureSvg } from "./visualRenderer"
import {
  assertFixtureStructuralSignals,
  canonicaliseMarkup,
  markupHash,
} from "./visualFingerprint"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BASELINE_DIR = resolve(__dirname, "visual-baselines")
const OWNER_APPROVE_ENV = "OWNER_APPROVE_VISUAL_BASELINE_UPDATE"

/**
 * 11 SDD §11.1 Pflicht-Fixtures. Excludes W9-7's "2teams-stage-4" because
 * the SDD specifies one combined "2 Teams Stufe 1 + Stufe 4" state — the
 * "2teams-stage-1" fixture already covers that visual baseline.
 */
const REQUIRED_FIXTURE_IDS: ReadonlyArray<FixtureId> = [
  "2teams-stage-1",
  "3teams-mixed",
  "4teams-all-stages",
  "fertilizer-on-team",
  "acid-rain-on-team",
  "shield-blocks-acid-rain",
  "sunbeam-and-growth",
  "damage-hurt",
  "game-completed-winner",
  "reconnect-latest-revision",
  "reduced-motion",
]

const REQUIRED_FIXTURES = REQUIRED_FIXTURE_IDS.map((id) => {
  const found = VISUAL_FIXTURES.find((f) => f.id === id)
  if (!found) throw new Error(`Missing fixture: ${id}`)
  return found
})

const VIEWPORT_LABELS: Readonly<Record<ViewportId, string>> = {
  "1920x1080": "Full-HD Display",
  "1366x768": "Beamer Default",
  "1280x720": "HD Laptop",
  "1024x768": "XGA Tablet",
  "375x667": "Smartphone Probe",
}

const baselinePath = (fixtureId: FixtureId, viewportId: ViewportId): string =>
  resolve(BASELINE_DIR, `${fixtureId}__${viewportId}.json`)

interface BaselineFile {
  readonly hash: string
  readonly measurements: ReturnType<typeof measureFixtureSvg>
  readonly fixtureTitle: string
  readonly viewportLabel: string
  readonly updatedAt: string
}

const readBaseline = (path: string): BaselineFile | null => {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BaselineFile
  } catch {
    return null
  }
}

const writeBaseline = (path: string, payload: BaselineFile): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf8")
}

const describeId = (fixtureId: FixtureId, viewportId: ViewportId): string =>
  `${fixtureId} @ ${viewportId}`

describe("Flower-Battle presenter visual regression (11 fixtures × 5 viewports)", () => {
  for (const viewportId of VISUAL_VIEWPORTS) {
    describe(`viewport: ${viewportId}`, () => {
      for (const fixture of REQUIRED_FIXTURES) {
        it(describeId(fixture.id, viewportId), () => {
          const html = renderFixtureHtml(fixture)
          const measurements = measureFixtureSvg(fixture)
          const hash = markupHash(html)

          // 1. SDD §11.3 False-PASS-Schutz — structural signals first.
          const structural = assertFixtureStructuralSignals(fixture, html)
          if (!structural.ok) {
            throw new Error(
              `[False-PASS] fixture ${fixture.id} @ ${viewportId} missing signals:\n` +
                structural.missing.map((m) => `  - ${m}`).join("\n"),
            )
          }

          // 2. Baseline compare / create.
          const path = baselinePath(fixture.id, viewportId)
          const existing = readBaseline(path)
          const now = new Date().toISOString()
          const payload: BaselineFile = {
            hash,
            measurements,
            fixtureTitle: fixture.title ?? fixture.description,
            viewportLabel: VIEWPORT_LABELS[viewportId],
            updatedAt: now,
          }

          if (!existing) {
            writeBaseline(path, payload)
            // eslint-disable-next-line no-console
            console.warn(
              `[visual-baseline] created initial baseline ${fixture.id}__${viewportId}.json (hash=${hash})`,
            )
            return
          }

          if (existing.hash === hash) {
            // GREEN — sanity-check measurements vs baseline.
            expect(measurements).toEqual(existing.measurements)
            return
          }

          // Mismatch — FAIL unless owner explicitly approved refresh.
          const excerpt = canonicaliseMarkup(html).slice(0, 240)
          const diagnostic = [
            `[visual-regression] ${fixture.id} @ ${viewportId}`,
            `  baseline hash: ${existing.hash} (updated ${existing.updatedAt})`,
            `  current  hash: ${hash}`,
            `  measurements delta:`,
            `    plantHeightsPx: ${existing.measurements.plantHeightsPx.join(",")} -> ${measurements.plantHeightsPx.join(",")}`,
            `    visiblePlotCount: ${existing.measurements.visiblePlotCount} -> ${measurements.visiblePlotCount}`,
            `    cloudCount: ${existing.measurements.cloudCount} -> ${measurements.cloudCount}`,
            `  markup excerpt: ${excerpt}…`,
          ].join("\n")

          if (process.env[OWNER_APPROVE_ENV] === "1") {
            writeBaseline(path, payload)
            // eslint-disable-next-line no-console
            console.warn(
              `[visual-baseline] OWNER-APPROVED refresh of ${fixture.id}__${viewportId}.json (hash=${hash})`,
            )
            return
          }

          throw new Error(
            `${diagnostic}\n` +
              `To refresh after deliberate visual change:\n` +
              `  ${OWNER_APPROVE_ENV}=1 pnpm --filter @razzoozle/web test visualRegression`,
          )
        })
      }
    })
  }
})
