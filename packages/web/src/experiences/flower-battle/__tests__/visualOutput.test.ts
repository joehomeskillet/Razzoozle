/**
 * Vitest wrapper around sideBySide.ts (WP-PRESENTER-8 / SDD §11.4).
 *
 * Exposes the script as a no-op test so the command
 *   `pnpm --filter @razzoozle/web test visualOutput`
 * exercises the generator end-to-end inside the existing test runner.
 * The script is also runnable standalone via tsx.
 */

import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { main as runSideBySide } from "./sideBySide"
import { COMPOSITE_PATH, REPORT_PATH } from "./sideBySidePaths"

describe("Flower-Battle side-by-side visual output", () => {
  it("generates side-by-side PNG + report JSON", () => {
    const result = runSideBySide()

    expect(existsSync(COMPOSITE_PATH)).toBe(true)
    expect(existsSync(REPORT_PATH)).toBe(true)

    const png = readFileSync(COMPOSITE_PATH)
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(result.compositeBytes).toBeGreaterThan(0)
    expect(result.reportEntries).toBeGreaterThanOrEqual(11)

    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as unknown[]
    expect(Array.isArray(report)).toBe(true)
    expect(report.length).toBeGreaterThanOrEqual(11)
  }, 30_000)
})
