// Unit tests for the winner side-cannon helper (confetti.ts).
//
// Pure TS — no React, no jsdom. canvas-confetti is mocked with a spy default
// export so we never load the real (dynamic-imported) lazy chunk. Covers the
// reduced-motion no-op short-circuit and the two-sided side-cannon burst,
// asserting the per-cannon origin/angle wiring matches the implementation.
// Mirrors the package's vitest conventions (describe/it/expect, 2-space
// indent, no semicolons).

import { afterEach, describe, expect, it, vi } from "vitest"

const confettiSpy = vi.fn()

vi.mock("canvas-confetti", () => ({
  default: confettiSpy,
}))

import { fireWinnerConfetti } from "./confetti"

afterEach(() => {
  confettiSpy.mockClear()
})

describe("fireWinnerConfetti", () => {
  it("is a no-op when reduced motion is requested", async () => {
    await expect(fireWinnerConfetti(true)).resolves.toBeUndefined()
    expect(confettiSpy).not.toHaveBeenCalled()
  })

  it("fires two side-cannons with matching origin/angle when motion is allowed", async () => {
    await fireWinnerConfetti(false)

    expect(confettiSpy).toHaveBeenCalledTimes(2)

    const [leftOpts] = confettiSpy.mock.calls[0] as [Record<string, unknown>]
    const [rightOpts] = confettiSpy.mock.calls[1] as [Record<string, unknown>]

    expect(leftOpts.origin).toEqual({ x: 0, y: 0.65 })
    expect(leftOpts.angle).toBe(60)
    expect(rightOpts.origin).toEqual({ x: 1, y: 0.65 })
    expect(rightOpts.angle).toBe(120)
  })

  it("passes the shared base options to every cannon", async () => {
    await fireWinnerConfetti(false)

    for (const call of confettiSpy.mock.calls) {
      const [opts] = call as [Record<string, unknown>]
      expect(opts.particleCount).toBe(70)
      expect(opts.spread).toBe(70)
      expect(opts.startVelocity).toBe(55)
      expect(opts.ticks).toBe(200)
      expect(opts.colors).toEqual(["#eab308", "#facc15", "#fef08a"])
    }
  })
})
