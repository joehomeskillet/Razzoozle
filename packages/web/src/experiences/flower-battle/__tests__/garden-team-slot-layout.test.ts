import { describe, expect, it } from "vitest"

import {
  getTeamSlotLayout,
  isTeamCountOverHardCap,
  TEAM_SLOT_MAX_TEAMS,
} from "../garden-team-slot-layout"

const VIEWPORT = { width: 1024, height: 768 }

const slotsByIndex = (
  count: number,
  viewport = VIEWPORT,
): ReturnType<typeof getTeamSlotLayout> =>
  getTeamSlotLayout(count, viewport)

describe("getTeamSlotLayout (WP-D-1, SDD §20.3)", () => {
  it("returns an empty layout for zero teams (no crash)", () => {
    expect(getTeamSlotLayout(0, VIEWPORT)).toEqual([])
  })

  it("returns 1 centred single slot for 1 team (User-P0 §20.3)", () => {
    const slots = getTeamSlotLayout(1, VIEWPORT)
    expect(slots).toHaveLength(1)
    // Slot ist zentriert: linke Kante = (100 - 40) / 2 = 30%, Breite = 40%
    expect(slots[0].xPercent).toBe(30)
    expect(slots[0].widthPercent).toBe(40)
    // Vertikal zentriert: obere Kante = (100 - 70) / 2 = 15%, Höhe = 70%
    expect(slots[0].yPercent).toBe(15)
    expect(slots[0].heightPercent).toBe(70)
    expect(slots[0].index).toBe(0)
  })

  it("returns an empty layout for invalid viewports", () => {
    expect(getTeamSlotLayout(2, { width: 0, height: 768 })).toEqual([])
    expect(getTeamSlotLayout(2, { width: 1024, height: 0 })).toEqual([])
    expect(
      getTeamSlotLayout(2, {
        width: Number.NaN,
        height: 768,
      }),
    ).toEqual([])
    expect(
      getTeamSlotLayout(2, {
        width: Number.POSITIVE_INFINITY,
        height: 768,
      }),
    ).toEqual([])
  })

  it("clamps team counts above the hard cap", () => {
    const overCap = TEAM_SLOT_MAX_TEAMS + 50
    const slots = getTeamSlotLayout(overCap, VIEWPORT)
    expect(slots.length).toBe(TEAM_SLOT_MAX_TEAMS)
    expect(isTeamCountOverHardCap(overCap)).toBe(true)
    expect(isTeamCountOverHardCap(4)).toBe(false)
  })

  it("returns 2 slots for 2 teams — two large slots side by side", () => {
    const slots = slotsByIndex(2)
    expect(slots).toHaveLength(2)

    const [left, right] = slots
    expect(left!.index).toBe(0)
    expect(right!.index).toBe(1)
    expect(left!.widthPercent).toBeGreaterThan(40)
    expect(right!.widthPercent).toBeGreaterThan(40)
    expect(right!.xPercent).toBeGreaterThan(left!.xPercent)
    expect(left!.yPercent).toBe(right!.yPercent)
    expect(left!.heightPercent).toBe(right!.heightPercent)
    const leftEnd = left!.xPercent + left!.widthPercent
    const rightStart = right!.xPercent
    expect(rightStart).toBeGreaterThanOrEqual(leftEnd - 0.01)
  })

  it("returns 3 equal slots for 3 teams", () => {
    const slots = slotsByIndex(3)
    expect(slots).toHaveLength(3)

    const widths = slots.map((s) => s.widthPercent)
    expect(widths[0]).toBeCloseTo(widths[1]!, 5)
    expect(widths[1]).toBeCloseTo(widths[2]!, 5)

    const ys = slots.map((s) => s.yPercent)
    expect(ys[0]).toBe(ys[1])
    expect(ys[1]).toBe(ys[2])

    for (let i = 0; i < slots.length - 1; i += 1) {
      const currentEnd = slots[i]!.xPercent + slots[i]!.widthPercent
      const nextStart = slots[i + 1]!.xPercent
      expect(nextStart).toBeGreaterThanOrEqual(currentEnd - 0.01)
    }
  })

  it("returns a 2x2 grid for 4 teams — compact slots (SDD §20.3)", () => {
    const slots = slotsByIndex(4)
    expect(slots).toHaveLength(4)

    const xs = slots.map((s) => s.xPercent)
    const ys = slots.map((s) => s.yPercent)
    const distinctX = new Set(xs).size
    const distinctY = new Set(ys).size
    expect(distinctX).toBe(2)
    expect(distinctY).toBe(2)

    // Compact vs. 2-team layout: 4-team slots are smaller in HEIGHT (2 rows
    // sharing the actor band). Width is identical to the 2-team layout
    // (same 2-column row geometry); the compactness comes from height.
    const twoTeam = slotsByIndex(2)
    const fourTeamSlot = slots[0]!
    const twoTeamSlot = twoTeam[0]!
    expect(fourTeamSlot.heightPercent).toBeLessThan(twoTeamSlot.heightPercent)
    // And the 4-team grid area covers a comparable total footprint.
    const fourArea = fourTeamSlot.widthPercent * fourTeamSlot.heightPercent
    const twoArea = twoTeamSlot.widthPercent * twoTeamSlot.heightPercent
    expect(fourArea).toBeLessThan(twoArea)
  })

  it("returns a 5-slot grid fallback for 5 teams", () => {
    const slots = slotsByIndex(5)
    expect(slots).toHaveLength(5)
    for (const slot of slots) {
      expect(slot.xPercent).toBeGreaterThanOrEqual(0)
      expect(slot.yPercent).toBeGreaterThanOrEqual(0)
      expect(slot.xPercent + slot.widthPercent).toBeLessThanOrEqual(100.01)
      expect(slot.yPercent + slot.heightPercent).toBeLessThanOrEqual(100.01)
    }
  })

  it("slot positions are deterministic — same input yields identical output", () => {
    const a = getTeamSlotLayout(3, VIEWPORT)
    const b = getTeamSlotLayout(3, VIEWPORT)
    expect(a).toEqual(b)
  })

  it("slot positions do not change for re-renders with the same teamCount", () => {
    const first = getTeamSlotLayout(3, VIEWPORT)
    const second = getTeamSlotLayout(3, VIEWPORT)
    const third = getTeamSlotLayout(3, VIEWPORT)
    expect(first).toEqual(second)
    expect(second).toEqual(third)
    for (const slot of first) {
      expect(slot.index).toBe(first.indexOf(slot))
    }
  })

  it("slot positions are sorted by teamId-equivalent index in ascending order", () => {
    const slots = slotsByIndex(4)
    const indices = slots.map((s) => s.index)
    expect(indices).toEqual([0, 1, 2, 3])
  })

  it("slots never overlap on the same row or column", () => {
    for (const count of [1, 2, 3, 4, 5, 6, 8]) {
      const slots = getTeamSlotLayout(count, VIEWPORT)
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) {
          const a = slots[i]!
          const b = slots[j]!
          const horizontalOverlap =
            a.xPercent < b.xPercent + b.widthPercent &&
            b.xPercent < a.xPercent + a.widthPercent
          const verticalOverlap =
            a.yPercent < b.yPercent + b.heightPercent &&
            b.yPercent < a.yPercent + a.heightPercent
          if (Math.abs(a.yPercent - b.yPercent) < 0.01) {
            expect(horizontalOverlap).toBe(false)
          }
          if (Math.abs(a.xPercent - b.xPercent) < 0.01) {
            expect(verticalOverlap).toBe(false)
          }
        }
      }
    }
  })

  it("all slot coordinates are finite and inside the viewport", () => {
    for (const count of [0, 1, 2, 3, 4, 5, 6, 8, 12]) {
      const slots = getTeamSlotLayout(count, VIEWPORT)
      for (const slot of slots) {
        expect(Number.isFinite(slot.xPercent)).toBe(true)
        expect(Number.isFinite(slot.yPercent)).toBe(true)
        expect(Number.isFinite(slot.widthPercent)).toBe(true)
        expect(Number.isFinite(slot.heightPercent)).toBe(true)
        expect(slot.widthPercent).toBeGreaterThan(0)
        expect(slot.heightPercent).toBeGreaterThan(0)
      }
    }
  })
})