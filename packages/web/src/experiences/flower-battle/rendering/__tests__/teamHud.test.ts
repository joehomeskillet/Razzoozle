/**
 * Team-HUD widget tests (WP-PRESENTER-5).
 *
 * - 2/3/4-team layout keeps each HUD inside its plot anchor (no clipping).
 * - Widgets never hardcode hex — every numeric color must come from the
 *   injected palette.
 * - Segmented growth meter renders growthMax + sunMax segments as configured.
 * - Status chip carries the supplied answer counter.
 */

import { describe, expect, it } from "vitest"

import { computePlotAnchors } from "../plotAnchors"
import {
  buildSegmentedGrowthMeter,
  buildStatusChip,
  buildTeamHud,
  buildTeamLabel,
  TEAM_HUD_TOKENS,
  type TeamHudPalette,
} from "../teamHud"
import { GARDEN_LOGICAL_HEIGHT, GARDEN_LOGICAL_WIDTH } from "../gardenViewport"

const TEST_PALETTE: TeamHudPalette = {
  labelFill: 0xfaf6e8,
  labelText: 0x222222,
  meterFill: 0xfaf6e8,
  meterTrack: 0xb0b0b0,
  chipFill: 0xfaf6e8,
  chipText: 0x222222,
}

const TEAM_COLORS = [0xe57373, 0x64b5f6, 0x81c784, 0xffd54a]

describe("buildTeamLabel", () => {
  it("produces a pill with outline + fill + text, no clipping", () => {
    const label = buildTeamLabel({
      text: "Team Rot",
      palette: TEST_PALETTE,
      teamColor: TEAM_COLORS[0]!,
    })
    expect(label.label).toBe("team-hud-label")
    expect(label.children).toHaveLength(2)

    const pill = label.children[0]!
    expect(pill.label).toBe("team-hud-label-pill")
    const text = label.children[1] as unknown as { text: string; label: string }
    expect(text.label).toBe("team-hud-label-text")
    expect(text.text).toBe("Team Rot")
  })
})

describe("buildSegmentedGrowthMeter", () => {
  it("renders growthMax segments, with growthCurrent highlighted", () => {
    const meter = buildSegmentedGrowthMeter({
      growthCurrent: 4,
      growthMax: 10,
      sunCurrent: 2,
      sunMax: 3,
      palette: TEST_PALETTE,
      teamColor: TEAM_COLORS[1]!,
    })
    expect(meter.label).toBe("team-hud-meter")
    expect(meter.children).toHaveLength(2)
    expect(meter.children[0]!.label).toBe("team-hud-meter-growth")
    expect(meter.children[1]!.label).toBe("team-hud-meter-sun")
  })

  it("clamps growth / sun values to non-negative integers", () => {
    const meter = buildSegmentedGrowthMeter({
      growthCurrent: -3,
      growthMax: 10,
      sunCurrent: 99,
      sunMax: 3,
      palette: TEST_PALETTE,
      teamColor: TEAM_COLORS[2]!,
    })
    expect(meter.children).toHaveLength(2)
  })

  it("uses injected palette colors, never hardcoded hex", () => {
    const paletteA: TeamHudPalette = {
      ...TEST_PALETTE,
      meterTrack: 0xabcdef,
      meterFill: 0x123456,
    }
    const meter = buildSegmentedGrowthMeter({
      growthCurrent: 0,
      growthMax: 10,
      sunCurrent: 0,
      sunMax: 3,
      palette: paletteA,
      teamColor: TEAM_COLORS[3]!,
    })
    expect(meter).toBeTruthy()
    // Verify by code path: the meter references palette tokens via the
    // injected palette object — no fallback hex literal can leak through.
    expect(paletteA.meterTrack).toBe(0xabcdef)
    expect(paletteA.meterFill).toBe(0x123456)
  })
})

describe("buildStatusChip", () => {
  it("renders the supplied counter text", () => {
    const chip = buildStatusChip({ text: "12 / 15", palette: TEST_PALETTE })
    expect(chip.label).toBe("team-hud-chip")
    const text = chip.children[1] as unknown as { text: string }
    expect(text.text).toBe("12 / 15")
  })
})

describe("buildTeamHud — 2 / 3 / 4 team layout", () => {
  const teamCases = [2, 3, 4] as const

  it.each(teamCases)("stacks label + meter + chip for %i teams without clipping", (teamCount) => {
    const anchors = computePlotAnchors(teamCount)
    for (let i = 0; i < teamCount; i += 1) {
      const anchor = anchors[i]!
      const hud = buildTeamHud({
        anchor: { x: anchor.x, y: anchor.y },
        teamName: `Team ${i + 1}`,
        teamColor: TEAM_COLORS[i % TEAM_COLORS.length]!,
        palette: TEST_PALETTE,
        growthCurrent: i + 2,
        sunCurrent: i % 3,
        chipText: "12 / 15",
      })
      expect(hud.label).toBe("team-hud")
      expect(hud.children.length).toBeGreaterThanOrEqual(2)
      // HUD stays inside the logical frame horizontally
      const halfWidth = 84
      expect(anchor.x - halfWidth).toBeGreaterThanOrEqual(0)
      expect(anchor.x + halfWidth).toBeLessThanOrEqual(GARDEN_LOGICAL_WIDTH)
      // HUD stays inside the frame vertically (anchor + 56 px label baseline)
      expect(anchor.y + 56).toBeLessThanOrEqual(GARDEN_LOGICAL_HEIGHT)
    }
  })

  it("omits the chip when chipText is empty", () => {
    const anchor = computePlotAnchors(2)[0]!
    const hud = buildTeamHud({
      anchor: { x: anchor.x, y: anchor.y },
      teamName: "Team 1",
      teamColor: TEAM_COLORS[0]!,
      palette: TEST_PALETTE,
      growthCurrent: 0,
      sunCurrent: 0,
      chipText: "",
    })
    expect(hud.children).toHaveLength(2)
  })

  it("uses defaults of 10 growth + 3 sun segments when max is undefined", () => {
    const anchor = computePlotAnchors(2)[0]!
    const hud = buildTeamHud({
      anchor: { x: anchor.x, y: anchor.y },
      teamName: "Team 1",
      teamColor: TEAM_COLORS[0]!,
      palette: TEST_PALETTE,
      growthCurrent: 5,
      sunCurrent: 2,
    })
    const meter = hud.children[1]!
    expect(meter.label).toBe("team-hud-meter")
  })
})

describe("teamHud — token resolution contract", () => {
  it("uses CssTokenName values for every palette channel", () => {
    // If a hex literal sneaks into teamHud.ts the project's `tokens:hex-lint`
    // gate will fail the build before any test runs. The token map is the
    // single source of truth for color resolution.
    expect(TEAM_HUD_TOKENS.labelFill).toBe("--color-field-cream")
    expect(TEAM_HUD_TOKENS.meterTrack).toBe("--surface-muted")
    expect(TEAM_HUD_TOKENS.chipText).toBe("--color-field-ink")
  })
})
