// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

import { dispatchCelebration } from "./ConfettiAdapter"

const {
  fireCenterSalvo,
  fireFullScreenBurst,
  fireTierConfetti,
  getTokenCanvasRgba,
} = vi.hoisted(() => ({
    fireCenterSalvo: vi.fn(() => Promise.resolve()),
    fireFullScreenBurst: vi.fn(() => Promise.resolve()),
    fireTierConfetti: vi.fn(() => Promise.resolve()),
    getTokenCanvasRgba: vi.fn((token: string) => `resolved:${token}`),
  }))

vi.mock("@razzoozle/web/features/game/utils/confetti", () => ({
  fireCenterSalvo,
  fireFullScreenBurst,
  fireTierConfetti,
}))

vi.mock("@razzoozle/web/features/theme/hyperShaderTokenSync", () => ({
  getTokenCanvasRgba,
}))

describe("dispatchCelebration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("forwards achievement ids and reduced motion to tier confetti", async () => {
    await dispatchCelebration(
      {
        id: "achievement-1",
        kind: "achievement",
        achievementIds: ["streak-3", "perfect-round"],
      },
      true,
    )

    expect(fireTierConfetti).toHaveBeenCalledOnce()
    expect(fireTierConfetti).toHaveBeenCalledWith(
      ["streak-3", "perfect-round"],
      true,
    )
    expect(fireCenterSalvo).not.toHaveBeenCalled()
  })

  it("resolves every color role and forwards colors and reduced motion", async () => {
    await dispatchCelebration(
      {
        id: "center-1",
        kind: "center-salvo",
        colorRoles: [
          "primary",
          "secondary",
          "accent",
          "success",
          "correct",
          "warning",
          "error",
          "wrong",
          "neutral",
          "info",
          "muted",
        ],
      },
      false,
    )

    expect(getTokenCanvasRgba.mock.calls.map(([token]) => token)).toEqual([
      "--color-primary",
      "--color-secondary",
      "--color-accent",
      "--state-correct",
      "--state-correct",
      "--timer-urgent",
      "--state-wrong",
      "--state-wrong",
      "--ink",
      "--team-blue",
      "--ink-muted",
    ])
    expect(fireCenterSalvo).toHaveBeenCalledOnce()
    expect(fireCenterSalvo).toHaveBeenCalledWith(false, [
      "resolved:--color-primary",
      "resolved:--color-secondary",
      "resolved:--color-accent",
      "resolved:--state-correct",
      "resolved:--state-correct",
      "resolved:--timer-urgent",
      "resolved:--state-wrong",
      "resolved:--state-wrong",
      "resolved:--ink",
      "resolved:--team-blue",
      "resolved:--ink-muted",
    ])
    expect(fireTierConfetti).not.toHaveBeenCalled()
  })

  it("fires the full-screen award-reveal burst, forwarding reduced motion through to canvas-confetti", async () => {
    await dispatchCelebration({ id: "award-1", kind: "award-reveal" }, true)

    expect(fireFullScreenBurst).toHaveBeenCalledOnce()
    expect(fireFullScreenBurst).toHaveBeenCalledWith(true, {
      colors: undefined,
      zIndex: undefined,
    })

    fireFullScreenBurst.mockClear()

    await dispatchCelebration(
      { id: "award-2", kind: "award-reveal", zIndex: 50 },
      false,
    )

    expect(fireFullScreenBurst).toHaveBeenCalledOnce()
    expect(fireFullScreenBurst).toHaveBeenCalledWith(false, {
      colors: undefined,
      zIndex: 50,
    })
    expect(fireTierConfetti).not.toHaveBeenCalled()
    expect(fireCenterSalvo).not.toHaveBeenCalled()
    expect(getTokenCanvasRgba).not.toHaveBeenCalled()
  })

  it("fires the same full-screen burst for 'game-win' (issue 918: Podium's semantic kind, additive alongside 'award-reveal')", async () => {
    await dispatchCelebration(
      { id: "podium-game-win", kind: "game-win" },
      false,
    )

    expect(fireFullScreenBurst).toHaveBeenCalledOnce()
    expect(fireFullScreenBurst).toHaveBeenCalledWith(false, {
      colors: undefined,
      zIndex: undefined,
    })
    expect(fireTierConfetti).not.toHaveBeenCalled()
    expect(fireCenterSalvo).not.toHaveBeenCalled()
    expect(getTokenCanvasRgba).not.toHaveBeenCalled()
  })

  it("ignores unknown celebration kinds", async () => {
    await expect(
      dispatchCelebration({ id: "future-1", kind: "future-effect" }, false),
    ).resolves.toBeUndefined()

    expect(fireTierConfetti).not.toHaveBeenCalled()
    expect(fireCenterSalvo).not.toHaveBeenCalled()
    expect(getTokenCanvasRgba).not.toHaveBeenCalled()
  })
})
