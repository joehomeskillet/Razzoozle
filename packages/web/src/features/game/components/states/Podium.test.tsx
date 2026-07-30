import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Podium, { shouldFireAwardReveal } from "./Podium"

// SSR regression suite for WP-KIT-14 (issue 917) — Podium.tsx used to
// lazy-load react-confetti with React.lazy + Suspense directly in its JSX.
// That pattern is gone: the podium now dispatches a one-shot "award-reveal"
// celebration via the shared adapter (experiences/shared/celebration) from a
// useEffect instead. This suite is deliberately minimal (render-structure
// smoke test + the trigger predicate as a pure logic test) — issue 918
// extends it further with full podium-behaviour coverage.

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

describe("Podium (SSR regression, WP-KIT-14)", () => {
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
})

describe("shouldFireAwardReveal (Confetti-Trigger-Bedingung)", () => {
  // apparition never advances past its useState(0) initial value under
  // renderToStaticMarkup (the interval-driving effect in usePodiumAnimation
  // never runs during SSR), so the trigger condition can only be exercised
  // as a pure function here — not through a component render.
  it("fires once apparition reaches 4 and motion is not reduced", () => {
    expect(shouldFireAwardReveal(4, false)).toBe(true)
  })

  it("does not fire before apparition reaches 4", () => {
    expect(shouldFireAwardReveal(0, false)).toBe(false)
    expect(shouldFireAwardReveal(3, false)).toBe(false)
  })

  it("does not fire when motion is reduced, even at apparition 4", () => {
    expect(shouldFireAwardReveal(4, true)).toBe(false)
  })
})
