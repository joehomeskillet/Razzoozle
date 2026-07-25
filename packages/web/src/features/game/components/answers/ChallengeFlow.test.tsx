import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ChallengeCard } from "./ChallengeCard"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; name?: string; quiz?: string; score?: number }) => {
      let str = options?.defaultValue ?? key
      if (options?.name) str = str.replace("{{name}}", options.name)
      if (options?.quiz) str = str.replace("{{quiz}}", options.quiz)
      if (options?.score !== undefined) str = str.replace("{{score}}", String(options.score))
      return str
    },
  }),
}))

describe("ChallengeFlow Component (Issue #473 / SDD #473)", () => {
  it("renders creator name, quiz title, and target score", () => {
    const html = renderToStaticMarkup(
      <ChallengeCard
        creatorName="Alice"
        creatorScore={1850}
        quizTitle="Allgemeinwissen"
      />
    )

    expect(html).toContain("Alice fordert dich in Allgemeinwissen heraus!")
    expect(html).toContain("Ziel: 1850 Punkte")
  })

  it("renders accept button and share button when handlers provided", () => {
    const html = renderToStaticMarkup(
      <ChallengeCard
        creatorName="Alice"
        creatorScore={1850}
        quizTitle="Allgemeinwissen"
        onAccept={vi.fn()}
        onShare={vi.fn()}
      />
    )

    expect(html).toContain('data-testid="challenge-accept"')
    expect(html).toContain('data-testid="challenge-share"')
  })

  it("supports testIdPrefix prop for custom test isolation", () => {
    const html = renderToStaticMarkup(
      <ChallengeCard
        creatorName="Alice"
        creatorScore={1850}
        quizTitle="Allgemeinwissen"
        testIdPrefix="solo-"
      />
    )

    expect(html).toContain('data-testid="solo-challenge-card"')
    expect(html).toContain('data-testid="solo-challenge-score-box"')
  })

  it("disables buttons when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <ChallengeCard
        creatorName="Alice"
        creatorScore={1850}
        quizTitle="Allgemeinwissen"
        onShare={vi.fn()}
        disabled={true}
      />
    )

    expect(html).toContain("disabled")
  })

  it("renders target score box with trophy icon", () => {
    const html = renderToStaticMarkup(
      <ChallengeCard
        creatorName="Bob"
        creatorScore={2100}
        quizTitle="Biologie Quiz"
      />
    )

    expect(html).toContain("Ziel: 2100 Punkte")
  })

  it("exports ChallengeCard function component", () => {
    expect(typeof ChallengeCard).toBe("function")
  })
})
