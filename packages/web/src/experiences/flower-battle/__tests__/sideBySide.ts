/**
 * Side-by-Side Visual Comparison (WP-PRESENTER-8 / SDD §11.4).
 *
 * Generates a VORHER (pre-refactor code path parameters) vs NACHHER (HEAD)
 * composite PNG that renders each fixture's garden twice and stamps a delta
 * footer. Output:
 *   - `visual-output/side-by-side.png` — composite PNG (zero-dep RGBA encoder)
 *   - `visual-output/side-by-side.report.json` — per-fixture measurements + delta
 *
 * Invoked via the vitest wrapper (`visualOutput.test.ts`) or directly via tsx.
 * Does NOT update baselines. Does NOT require jsdom — no DOM involved.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"

import { VISUAL_FIXTURES, type VisualFixture } from "./visualFixtures"
import { measureFixtureSvg } from "./visualRenderer"
import type { FixtureMeasurements } from "./visualRenderer"
import { COMPOSITE_PATH, OUTPUT_DIR_PATH, REPORT_PATH } from "./sideBySidePaths"

/* -------------------------------------------------------------------------- */
/* VORHER constants — mirror the pre-refactor parameters from the era of    */
/* the original garden scene (commit ~910242899 in the WP message). These    */
/* are HARDCODED on purpose so the "old" output stays byte-stable.           */
/* -------------------------------------------------------------------------- */

const VORHER_STAGE_TO_HEIGHT: Readonly<Record<number, number>> = {
  1: 60,
  2: 200,
  3: 320,
  4: 460,
}

const VORHER_CLOUD_COUNT = 3

const vorherStageHeight = (stage: number): number =>
  VORHER_STAGE_TO_HEIGHT[stage] ?? VORHER_STAGE_TO_HEIGHT[1]

const measureVorher = (fixture: VisualFixture): FixtureMeasurements => ({
  plantHeightsPx: fixture.teams.map((t) => vorherStageHeight(t.growthStage)),
  visiblePlotCount: fixture.teams.length,
  cloudCount: VORHER_CLOUD_COUNT,
})

/* -------------------------------------------------------------------------- */
/* Minimal PNG encoder (RGBA, no deps).                                       */
/* -------------------------------------------------------------------------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const crc32Table = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = crc32Table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBytes = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([length, typeBytes, data, crc])
}

const encodePng = (width: number, height: number, rgba: Buffer): Buffer => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // color type RGBA
  ihdr.writeUInt8(0, 10) // compression
  ihdr.writeUInt8(0, 11) // filter
  ihdr.writeUInt8(0, 12) // interlace

  const rowBytes = width * 4
  const raw = Buffer.alloc((rowBytes + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0
    rgba.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes)
  }
  const compressed = deflateSync(raw)

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------------------- */
/* Composite painter — draws the structural measurements onto a 2D RGBA      */
/* buffer (no DOM rasteriser needed).                                        */
/* -------------------------------------------------------------------------- */

const COMPOSITE_WIDTH = 1600
const COMPOSITE_HEIGHT_PER_ROW = 480
const HEADER_HEIGHT = 80

const fillRect = (
  buf: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: readonly [number, number, number],
): void => {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = ((y + py) * COMPOSITE_WIDTH + (x + px)) * 4
      buf[idx] = fill[0]
      buf[idx + 1] = fill[1]
      buf[idx + 2] = fill[2]
      buf[idx + 3] = 255
    }
  }
}

const drawGardenRow = (
  buf: Buffer,
  rowTop: number,
  halfOffset: number,
  halfWidth: number,
  measurements: FixtureMeasurements,
): void => {
  const labelHeight = 32
  const drawY = rowTop + labelHeight
  const drawH = COMPOSITE_HEIGHT_PER_ROW - labelHeight

  // Sky band (45 % of row height)
  const skyH = Math.round(drawH * 0.45)
  fillRect(buf, halfOffset, drawY, halfWidth, skyH, [191, 226, 255])
  // Soil
  const soilY = drawY + skyH
  fillRect(buf, halfOffset, soilY, halfWidth, drawH - skyH, [91, 63, 36])
  // Plants
  const slotCount = measurements.visiblePlotCount
  measurements.plantHeightsPx.forEach((height, i) => {
    const cx = halfOffset + Math.round(halfWidth * (i + 0.5) / Math.max(1, slotCount))
    const plantTop = soilY + 40 - Math.round(height * (drawH / 600))
    const stemH = Math.max(8, soilY + 40 - plantTop)
    fillRect(buf, cx - 4, plantTop, 8, stemH, [77, 138, 77])
  })
}

interface ReportEntry {
  readonly fixtureId: string
  readonly vorher: FixtureMeasurements
  readonly nachher: FixtureMeasurements
  readonly deltas: {
    readonly plantHeightsPx: readonly number[]
    readonly visiblePlotCount: number
    readonly cloudCount: number
  }
}

export const main = (): { compositeBytes: number; reportEntries: number } => {
  mkdirSync(OUTPUT_DIR_PATH, { recursive: true })

  const totalHeight = HEADER_HEIGHT + VISUAL_FIXTURES.length * COMPOSITE_HEIGHT_PER_ROW
  const buf = Buffer.alloc(COMPOSITE_WIDTH * totalHeight * 4)

  // Top header
  fillRect(buf, 0, 0, COMPOSITE_WIDTH, HEADER_HEIGHT, [31, 41, 51])

  const halfWidth = Math.floor(COMPOSITE_WIDTH / 2)
  const report: ReportEntry[] = []

  VISUAL_FIXTURES.forEach((fixture, i) => {
    const nachher = measureFixtureSvg(fixture)
    const vorher = measureVorher(fixture)
    const rowTop = HEADER_HEIGHT + i * COMPOSITE_HEIGHT_PER_ROW

    // VORHER (left) — blue header band
    fillRect(buf, 0, rowTop, halfWidth, 32, [106, 176, 255])
    drawGardenRow(buf, rowTop, 0, halfWidth, vorher)

    // NACHHER (right) — gold header band
    fillRect(buf, halfWidth, rowTop, COMPOSITE_WIDTH - halfWidth, 32, [245, 197, 66])
    drawGardenRow(buf, rowTop, halfWidth, COMPOSITE_WIDTH - halfWidth, nachher)

    report.push({
      fixtureId: fixture.id,
      vorher,
      nachher,
      deltas: {
        plantHeightsPx: nachher.plantHeightsPx.map(
          (h, idx) => h - (vorher.plantHeightsPx[idx] ?? 0),
        ),
        visiblePlotCount: nachher.visiblePlotCount - vorher.visiblePlotCount,
        cloudCount: nachher.cloudCount - vorher.cloudCount,
      },
    })
  })

  const png = encodePng(COMPOSITE_WIDTH, totalHeight, buf)
  writeFileSync(COMPOSITE_PATH, png)
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n")

  // eslint-disable-next-line no-console
  console.log(
    `[sideBySide] wrote ${COMPOSITE_PATH} (${png.length} bytes) + ${REPORT_PATH}`,
  )
  return { compositeBytes: png.length, reportEntries: report.length }
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]))

if (isDirectInvocation) {
  main()
}
