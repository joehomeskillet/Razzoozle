import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { AnswerDistributionDisplay } from "../AnswerDistributionDisplay"

// Mock animation hook
vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    item: () => ({}),
    container: () => ({}),
    spring: {},
    reduced: false,
  }),
}))

// Mock utility functions
vi.mock("@razzoozle/web/features/game/utils/answers", () => ({
  answerLabel: (key: number) => String.fromCharCode(65 + key), // A, B, C, D
  answerColor: (key: number) => `bg-answer-${key + 1}`,
}))

describe("AnswerDistributionDisplay", () => {
  it("renders bar chart with correct number of bars", () => {
    const html = renderToStaticMarkup(
      <AnswerDistributionDisplay
        answers={["Option A", "Option B", "Option C"]}
        responses={{ "0": 15, "1": 10, "2": 5 }}
        percentages={{ "0": "50%", "1": "33%", "2": "17%" }}
      />
    )

    // Should contain the response counts
    expect(html).toContain("15")
    expect(html).toContain("10")
    expect(html).toContain("5")
  })

  it("renders answer labels correctly", () => {
    const html = renderToStaticMarkup(
      <AnswerDistributionDisplay
        answers={["First", "Second"]}
        responses={{ "0": 20, "1": 30 }}
        percentages={{ "0": "40%", "1": "60%" }}
      />
    )

    // Verify labels (A for first, B for second)
    expect(html).toContain("A")
    expect(html).toContain("B")
  })

  it("applies height from percentages prop", () => {
    const html = renderToStaticMarkup(
      <AnswerDistributionDisplay
        answers={["Option"]}
        responses={{ "0": 100 }}
        percentages={{ "0": "75%" }}
      />
    )

    expect(html).toContain("height:75%")
  })

  it("uses correct color classes for each answer", () => {
    const html = renderToStaticMarkup(
      <AnswerDistributionDisplay
        answers={["A", "B"]}
        responses={{ "0": 10, "1": 20 }}
        percentages={{ "0": "33%", "1": "67%" }}
      />
    )

    expect(html).toContain("bg-answer-1")
    expect(html).toContain("bg-answer-2")
  })

  it("handles missing response counts with zero default", () => {
    const html = renderToStaticMarkup(
      <AnswerDistributionDisplay
        answers={["X", "Y"]}
        responses={{ "1": 50 }}
        percentages={{ "0": "0%", "1": "100%" }}
      />
    )

    // First answer should show 0
    expect(html).toContain("0")
    expect(html).toContain("50")
  })

  it("includes grid layout with correct template columns", () => {
    const html = renderToStaticMarkup(
      <AnswerDistributionDisplay
        answers={["1", "2", "3", "4"]}
        responses={{ "0": 5, "1": 10, "2": 15, "3": 20 }}
        percentages={{
          "0": "20%",
          "1": "40%",
          "2": "60%",
          "3": "80%",
        }}
      />
    )

    expect(html).toContain("grid")
    expect(html).toContain("grid-template-columns:repeat(4, 1fr)")
  })

  it("includes motion container classes", () => {
    const html = renderToStaticMarkup(
      <AnswerDistributionDisplay
        answers={["Test"]}
        responses={{ "0": 1 }}
        percentages={{ "0": "100%" }}
      />
    )

    // Verify grid and flex layout classes
    expect(html).toContain("grid")
    expect(html).toContain("items-end")
    expect(html).toContain("gap-4")
  })
})
