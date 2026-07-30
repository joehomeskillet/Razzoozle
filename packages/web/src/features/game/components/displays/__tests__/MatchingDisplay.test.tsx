import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MatchingDisplay } from "../MatchingDisplay"

// Mock translations and animation hooks
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "game:matching.correctMatches": "Correct Matches",
      }
      return translations[key] || key
    },
  }),
}))

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    item: () => ({}),
    container: () => ({}),
    spring: {},
    reduced: false,
  }),
}))

describe("MatchingDisplay", () => {
  it("renders nothing when correctMatches is empty", () => {
    const html = renderToStaticMarkup(<MatchingDisplay correctMatches={[]} />)
    expect(html).toBe("")
  })

  it("renders nothing when correctMatches is undefined", () => {
    const html = renderToStaticMarkup(<MatchingDisplay correctMatches={undefined} />)
    expect(html).toBe("")
  })

  it("renders correct matches as chips", () => {
    const matches = ["Paris", "London", "Berlin"]
    const html = renderToStaticMarkup(
      <MatchingDisplay correctMatches={matches} />
    )

    expect(html).toContain("Correct Matches")
    expect(html).toContain("Paris")
    expect(html).toContain("London")
    expect(html).toContain("Berlin")
    expect(html).toContain("bg-[var(--state-correct)]")
  })

  it("includes proper CSS classes for styling", () => {
    const html = renderToStaticMarkup(
      <MatchingDisplay correctMatches={["Match1"]} />
    )

    expect(html).toContain("text-center")
    expect(html).toContain("shadow-[var(--shadow-flat)]")
    expect(html).toContain("rounded-[var(--radius-theme)]")
  })
})
