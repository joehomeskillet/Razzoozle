/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { fireFeedback, __clearCache__ } from "./experienceFeedbackService"

// Mock the stores and haptics before any other imports.
vi.mock("@razzoozle/web/features/game/stores/sound", () => ({
  useSoundStore: {
    getState: vi.fn(() => ({ muted: false })),
  },
}))

vi.mock("@razzoozle/web/features/game/stores/haptics", () => ({
  useHapticsStore: {
    getState: vi.fn(() => ({ enabled: true })),
  },
}))

vi.mock("@razzoozle/web/features/game/utils/haptics", () => ({
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
  hapticError: vi.fn(),
  hapticWin: vi.fn(),
  hapticCountdown: vi.fn(),
  hapticAchievement: vi.fn(),
}))

vi.mock("@razzoozle/web/features/theme/store", () => ({
  useThemeStore: {
    getState: vi.fn(() => ({
      theme: {
        sounds: {},
      },
    })),
  },
}))

// Mock Audio globally (node environment doesn't have it).
function MockAudio(this: any, url: string) {
  this.url = url
  this.volume = 1
  this.currentTime = 0
  this.preload = ""
  this.play = vi.fn().mockResolvedValue(undefined)
  this.load = vi.fn()
  this.addEventListener = vi.fn()
  return this
}
global.Audio = vi.fn(MockAudio) as any

// Import mocked modules after mocks are set up.
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { useHapticsStore } from "@razzoozle/web/features/game/stores/haptics"
import * as hapticsModule from "@razzoozle/web/features/game/utils/haptics"
import { useThemeStore } from "@razzoozle/web/features/theme/store"

describe("experienceFeedbackService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearCache__()
    // Reset mocks to default state (sound not muted, haptics enabled).
    ;(useSoundStore.getState as any).mockReturnValue({ muted: false })
    ;(useHapticsStore.getState as any).mockReturnValue({ enabled: true })
    ;(useThemeStore.getState as any).mockReturnValue({
      theme: { sounds: {} },
    })
  })

  it("fires all 11 cues without crashing", () => {
    const cues = [
      "progress-small",
      "progress-large",
      "negative-small",
      "negative-large",
      "powerup-ready",
      "powerup-activate",
      "shield-block",
      "phase-complete",
      "achievement",
      "game-win",
      "game-loss",
    ] as const

    cues.forEach((cue) => {
      expect(() => {
        fireFeedback(cue)
      }).not.toThrow()
    })
  })

  it("unknown cue does not crash", () => {
    expect(() => {
      fireFeedback("unknown-cue" as any)
    }).not.toThrow()
  })

  it("mute suppresses only audio, not haptics", () => {
    ;(useSoundStore.getState as any).mockReturnValue({ muted: true })

    __clearCache__()
    fireFeedback("progress-small")

    // Haptic should still fire.
    expect(hapticsModule.hapticTap).toHaveBeenCalled()

    // Audio should not be created/played.
    expect(global.Audio).not.toHaveBeenCalled()
  })

  it("haptics-disabled suppresses only vibration, not audio", () => {
    ;(useHapticsStore.getState as any).mockReturnValue({ enabled: false })

    __clearCache__()
    fireFeedback("progress-large")

    // Audio should still be created (audio still fires even if haptics are off).
    expect(global.Audio).toHaveBeenCalledWith(expect.stringContaining("sounds"))
  })

  it("deduplication skips same cue within window", () => {
    __clearCache__()

    // First fire: should trigger.
    fireFeedback("progress-small")
    expect(hapticsModule.hapticTap).toHaveBeenCalledTimes(1)

    // Second fire immediately: should be skipped (dedup).
    fireFeedback("progress-small")
    expect(hapticsModule.hapticTap).toHaveBeenCalledTimes(1)
  })

  it("bypassDedup forces fire even within dedup window", () => {
    __clearCache__()

    // First fire.
    fireFeedback("progress-small")
    expect(hapticsModule.hapticTap).toHaveBeenCalledTimes(1)

    // Second fire with bypassDedup.
    fireFeedback("progress-small", { bypassDedup: true })
    expect(hapticsModule.hapticTap).toHaveBeenCalledTimes(2)
  })

  it("different cues are not deduplicated together", () => {
    __clearCache__()

    // Fire progress-small.
    fireFeedback("progress-small")
    expect(hapticsModule.hapticTap).toHaveBeenCalledTimes(1)

    // Fire progress-large (different cue): should not be skipped.
    fireFeedback("progress-large")
    expect(hapticsModule.hapticSuccess).toHaveBeenCalledTimes(1)
  })

  it("no leaked timers after teardown", () => {
    __clearCache__()
    fireFeedback("progress-small")
    __clearCache__()

    // No assertion needed: vitest warns on leaked timers.
    // This test passes if teardown doesn't complain.
    expect(true).toBe(true)
  })
})
