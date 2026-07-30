import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import TextAnswersDisplay from "./TextAnswersDisplay"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "game:sentenceBuilder.correctSentence")
        return "Correct Sentence"
      return key
    },
  }),
}))

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    container: () => ({ hidden: {}, visible: {} }),
    item: () => ({ hidden: {}, visible: {} }),
    spring: { type: "spring" },
    reduced: false,
  }),
}))

describe("TextAnswersDisplay SSR Parity", () => {
  const defaultProps = {
    textResponses: {
      "Hello World": 5,
      "Goodbye World": 3,
      "Test Answer": 1,
    },
    acceptedAnswers: ["Hello World"],
    matchMode: "normalized" as const,
    correctChunks: ["The", "correct", "sentence"],
    isTypeAnswer: true,
    isSentenceBuilder: false,
  }

  it("renders text responses sorted by frequency", () => {
    const html = renderToStaticMarkup(<TextAnswersDisplay {...defaultProps} />)
    const helloIndex = html.indexOf("Hello World")
    const goodbyeIndex = html.indexOf("Goodbye World")
    const testIndex = html.indexOf("Test Answer")
    expect(helloIndex).toBeLessThan(goodbyeIndex)
    expect(goodbyeIndex).toBeLessThan(testIndex)
  })

  it("renders text response counts", () => {
    const html = renderToStaticMarkup(<TextAnswersDisplay {...defaultProps} />)
    expect(html).toContain(">5<")
    expect(html).toContain(">3<")
  })

  it("renders accepted answers legend when isTypeAnswer is true", () => {
    const html = renderToStaticMarkup(<TextAnswersDisplay {...defaultProps} />)
    // Legend has mb-4 class marker in the wrapper
    expect(html).toContain("mb-4")
  })

  it("does NOT render legend container when isSentenceBuilder even with acceptedAnswers", () => {
    const props = {
      ...defaultProps,
      isTypeAnswer: false,
      isSentenceBuilder: true,
      acceptedAnswers: ["Hello World"],
    }
    const html = renderToStaticMarkup(<TextAnswersDisplay {...props} />)
    // The legend is wrapped in <div className="mb-4 flex ...">
    // This container should not exist in sentence-builder mode
    expect(html).not.toContain("mb-4 flex flex-wrap gap-2")
  })

  it("renders scroll container", () => {
    const html = renderToStaticMarkup(<TextAnswersDisplay {...defaultProps} />)
    expect(html).toContain("max-h-[40vh]")
  })

  it("renders with flex layout", () => {
    const html = renderToStaticMarkup(<TextAnswersDisplay {...defaultProps} />)
    expect(html).toContain("flex items-center justify-between")
  })

  it("renders correct chunks when isSentenceBuilder", () => {
    const props = {
      ...defaultProps,
      isTypeAnswer: false,
      isSentenceBuilder: true,
    }
    const html = renderToStaticMarkup(<TextAnswersDisplay {...props} />)
    expect(html).toContain("Correct Sentence")
  })

  it("omits chunks when isSentenceBuilder is false", () => {
    const props = { ...defaultProps, isSentenceBuilder: false }
    const html = renderToStaticMarkup(<TextAnswersDisplay {...props} />)
    expect(html).not.toContain("Correct Sentence")
  })
})
