import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import SharePage, { shouldFireAwardReveal } from "./SharePage"

// SSR regression suite for WP-KIT-14 (issue 917) — SharePage.tsx used to
// lazy-load react-confetti with React.lazy + Suspense directly in its JSX.
// That pattern is gone: the share page now dispatches a one-shot
// "award-reveal" celebration via the shared adapter
// (experiences/shared/celebration) from a useEffect instead. This suite is
// deliberately minimal (render-structure smoke test + the trigger predicate
// as a pure logic test), mirroring Podium.test.tsx.
//
// `result` is only ever set from a socket event (mocked as a no-op below),
// so under renderToStaticMarkup the component only ever reaches its loading
// branch — that's the one render-structure assertion this suite can make
// without a DOM/effect runtime.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.defaultValue === "string") {
        return opts.defaultValue as string
      }
      return key
    },
    i18n: { language: "de" },
  }),
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    connect: vi.fn(),
    isConnected: false,
    socket: { emit: vi.fn() },
  }),
  useEvent: () => {},
}))

// __APP_VERSION__ is a vite `define` build-time global (see vite.config.ts) —
// vitest.config.ts (the plain-node test runner) doesn't provide it. Stubbed
// here only because Background.tsx (unrelated to this migration) reads it.
vi.stubGlobal("__APP_VERSION__", "0.0.0-test")

const render = () => renderToStaticMarkup(<SharePage id="share-1" />)

describe("SharePage (SSR regression, WP-KIT-14)", () => {
  it("renders the loading state without throwing (react-confetti's lazy+Suspense pattern is gone)", () => {
    const html = render()
    expect(html).toContain("results:share.loading")
  })

  it("never mounts a react-confetti/canvas element during SSR (the reveal effect never runs server-side)", () => {
    const html = render()
    expect(html).not.toContain("<canvas")
  })
})

describe("shouldFireAwardReveal (Confetti-Trigger-Bedingung)", () => {
  // `result` only ever transitions null -> object via a socket event, which
  // never fires under renderToStaticMarkup, so the trigger condition can
  // only be exercised as a pure function here — not through a component
  // render (mirrors Podium.test.tsx's rationale).
  it("fires once a result is loaded and motion is not reduced", () => {
    expect(shouldFireAwardReveal(true, false)).toBe(true)
  })

  it("does not fire before a result is loaded", () => {
    expect(shouldFireAwardReveal(false, false)).toBe(false)
  })

  it("does not fire when motion is reduced, even with a loaded result", () => {
    expect(shouldFireAwardReveal(true, true)).toBe(false)
  })

  it("treats a null reducedMotion (initial framer-motion value) as not-reduced", () => {
    expect(shouldFireAwardReveal(true, null)).toBe(true)
  })
})
