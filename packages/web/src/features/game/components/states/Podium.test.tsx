import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Podium, {
  deriveApparitionFromElapsed,
  shouldFireGameWinCelebration,
} from "./Podium"

// SSR regression suite for WP-KIT-14 (issue 917) — Podium.tsx used to
// lazy-load react-confetti with React.lazy + Suspense directly in its JSX.
// That pattern is gone: the podium now dispatches a one-shot celebration via
// the shared adapter (experiences/shared/celebration) from a useEffect
// instead. This suite is deliberately minimal (render-structure smoke test +
// the trigger predicate as a pure logic test).
//
// Extended for WP-KIT-15 (issue 918): the celebration kind was raised from
// the generic "award-reveal" placeholder to the semantic "game-win" kind
// (shouldFireAwardReveal renamed to shouldFireGameWinCelebration to match —
// its condition is unchanged), and the apparition/timing counter that used
// to be a raw setInterval was replaced with the Kit-Timeline abstraction
// (issue 910, useExperienceTimeline) — deriveApparitionFromElapsed is the new
// pure mapping from elapsed phase time to the podium's 4 reveal steps,
// covered below as its own logic-test suite (same rationale as the trigger
// predicate: `apparition` never advances past its initial state under
// renderToStaticMarkup, so this can only be exercised as a pure function).

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.defaultValue === "string") {
        return opts.defaultValue as string
      }
      return key
    },
  }),
}))

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    container: () => ({}),
    item: () => ({}),
    spring: {},
    snap: {},
    pop: () => ({}),
    reduced: false,
  }),
}))

vi.mock("use-sound", () => ({
  default: () => [vi.fn(), { stop: vi.fn() }],
}))

vi.mock("@razzoozle/web/features/game/stores/sound", () => ({
  useSoundStore: (selector: (s: { muted: boolean }) => unknown) =>
    selector({ muted: false }),
}))

vi.mock("@razzoozle/web/features/game/utils/sfx", () => ({
  useSoundUrl: () => "/sounds/mock.mp3",
}))

type Finished = ManagerStatusDataMap["FINISHED"]

const basePlayer = (username: string, points: number) => ({
  id: username,
  clientId: username,
  connected: true,
  username,
  points,
  streak: 0,
})

const base: Finished = {
  subject: "Quiz Night",
  top: [basePlayer("Alice", 300), basePlayer("Bob", 200), basePlayer("Cleo", 100)],
  autoMode: false,
  endScreen: "full",
}

const render = (data: Partial<Finished> = {}) =>
  renderToStaticMarkup(<Podium data={{ ...base, ...data }} />)

describe("Podium (SSR regression, WP-KIT-14 / WP-KIT-15)", () => {
  it("renders the podium structure without throwing (react-confetti's lazy+Suspense pattern is gone)", () => {
    const html = render()
    expect(html).toContain('data-testid="podium"')
    expect(html).toContain("Quiz Night")
    expect(html).toContain("Alice")
    expect(html).toContain("Bob")
    expect(html).toContain("Cleo")
  })

  it("renders the single-winner layout without throwing", () => {
    const html = render({ top: [basePlayer("Solo", 500)] })
    expect(html).toContain("Solo")
  })

  it("never mounts a react-confetti/canvas element during SSR (the reveal effect never runs server-side)", () => {
    const html = render()
    expect(html).not.toContain("<canvas")
  })

  it("renders without throwing now that usePodiumAnimation reads the Kit-Timeline hook (issue 910) instead of a raw setInterval", () => {
    // useExperienceTimeline's own ticking effect never runs under SSR either
    // (same reasoning as the celebration effect below), so this mainly
    // guards against a module-load-time crash from the new imports
    // (useLowLatencyStore, monoNow, useExperienceTimeline, fireFeedback).
    expect(() => render()).not.toThrow()
  })
})

describe("shouldFireGameWinCelebration (Confetti-Trigger-Bedingung, Reduced-Gate)", () => {
  // apparition never advances past its initial value under
  // renderToStaticMarkup (the effect driving it in usePodiumAnimation never
  // runs during SSR), so the trigger condition can only be exercised as a
  // pure function here — not through a component render.
  it("fires once apparition reaches 4 and motion is not reduced", () => {
    expect(shouldFireGameWinCelebration(4, false)).toBe(true)
  })

  it("does not fire before apparition reaches 4", () => {
    expect(shouldFireGameWinCelebration(0, false)).toBe(false)
    expect(shouldFireGameWinCelebration(3, false)).toBe(false)
  })

  it("does not fire when motion is reduced, even at apparition 4 (reduced-motion gate)", () => {
    expect(shouldFireGameWinCelebration(4, true)).toBe(false)
  })
})

describe("deriveApparitionFromElapsed (Kit-Timeline step mapping, issue 910)", () => {
  // Hard literals matching the 4x2000ms cadence usePodiumAnimation used
  // before this migration (Three at step 1, Second at 2, SnearRoll at 3,
  // First at 4) — same delays, now measured as elapsed time.
  it("stays at step 0 until the first 2000ms boundary", () => {
    expect(deriveApparitionFromElapsed(0)).toBe(0)
    expect(deriveApparitionFromElapsed(1999)).toBe(0)
  })

  it("advances one step per 2000ms boundary", () => {
    expect(deriveApparitionFromElapsed(2000)).toBe(1)
    expect(deriveApparitionFromElapsed(3999)).toBe(1)
    expect(deriveApparitionFromElapsed(4000)).toBe(2)
    expect(deriveApparitionFromElapsed(5999)).toBe(2)
    expect(deriveApparitionFromElapsed(6000)).toBe(3)
    expect(deriveApparitionFromElapsed(7999)).toBe(3)
    expect(deriveApparitionFromElapsed(8000)).toBe(4)
  })

  it("clamps at step 4 for any elapsed time beyond the full cadence", () => {
    expect(deriveApparitionFromElapsed(20_000)).toBe(4)
    expect(deriveApparitionFromElapsed(Number.MAX_SAFE_INTEGER)).toBe(4)
  })

  it("is defensive against non-finite or negative elapsed values (clock-skew guard)", () => {
    expect(deriveApparitionFromElapsed(Number.NaN)).toBe(0)
    expect(deriveApparitionFromElapsed(Number.POSITIVE_INFINITY)).toBe(0)
    expect(deriveApparitionFromElapsed(-500)).toBe(0)
  })
})
