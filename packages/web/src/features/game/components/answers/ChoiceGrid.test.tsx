import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { isUnscoredQuestionType, type QuestionType } from "@razzoozle/common/constants"
import ChoiceGrid from "./ChoiceGrid"
import { vi } from "vitest"

// Node-env SSR render (no jsdom in this package — see vitest.config.ts), same
// pattern as MultiSelectGrid.test.tsx: motion/react is mocked to plain tags so
// renderToStaticMarkup doesn't need a DOM.
vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
  motion: {
    div: ({ children, className, "data-testid": testId }: any) => (
      <div className={className} data-testid={testId}>
        {children}
      </div>
    ),
  },
}))

/**
 * Pins the exact `feedback` computation SoloAnswers.tsx uses for its
 * ChoiceGrid branch (the poll/choice/boolean fallback — see
 * SoloAnswers.tsx §isUnscored): `resultReady && !isUnscoredQuestionType(type)
 * ? { correct } : undefined`. Regression test for #504 — a solo poll answer
 * was rendered with a red "wrong" tile because `poll` correctness was passed
 * straight through instead of being suppressed for unscored types.
 */
function soloFeedback(type: QuestionType, correct: boolean) {
  return isUnscoredQuestionType(type) ? undefined : { correct }
}

describe("ChoiceGrid — unscored feedback suppression (#504)", () => {
  it("does not mark the picked tile wrong for a poll (unscored)", () => {
    const html = renderToStaticMarkup(
      <ChoiceGrid
        value={0}
        onChange={() => {}}
        onSubmit={() => {}}
        disabled
        feedback={soloFeedback("poll", false)}
        testIdPrefix="solo-"
        answers={["Ja", "Nein"]}
      />,
    )

    expect(html).not.toContain("var(--state-wrong)")
    expect(html).not.toContain("var(--state-correct)")
  })

  it("still marks the picked tile wrong for a SCORED choice question (regression guard)", () => {
    const html = renderToStaticMarkup(
      <ChoiceGrid
        value={0}
        onChange={() => {}}
        onSubmit={() => {}}
        disabled
        feedback={soloFeedback("choice", false)}
        testIdPrefix="solo-"
        answers={["Berlin", "Paris"]}
      />,
    )

    expect(html).toContain("var(--state-wrong)")
  })

  it("suppresses feedback for all 5 unscored types (poll, word-cloud, brainstorm, confidence, micro-lesson)", () => {
    const unscoredTypes: QuestionType[] = [
      "poll",
      "word-cloud",
      "brainstorm",
      "confidence",
      "micro-lesson",
    ]

    for (const type of unscoredTypes) {
      const html = renderToStaticMarkup(
        <ChoiceGrid
          value={0}
          onChange={() => {}}
          onSubmit={() => {}}
          disabled
          feedback={soloFeedback(type, false)}
          testIdPrefix="solo-"
          answers={["A", "B"]}
        />,
      )

      expect(html).not.toContain("var(--state-wrong)")
    }
  })
})
