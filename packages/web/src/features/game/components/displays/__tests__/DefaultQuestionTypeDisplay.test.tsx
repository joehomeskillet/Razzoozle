import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { DefaultQuestionTypeDisplay } from "../DefaultQuestionTypeDisplay"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      // Mock translations for test question types
      const translations: Record<string, string> = {
        "quizz:type.choice": "Einfache Auswahl",
        "quizz:type.choiceDesc": "Eine Antwort auswählen",
        "quizz:type.multipleSelect": "Mehrfachauswahl",
        "quizz:type.multipleSelectDesc": "Mehrere Antworten auswählen",
        "quizz:type.boolean": "Wahr/Falsch",
        "quizz:type.booleanDesc": "Stimmt oder nicht?",
      }

      if (key.includes("count")) {
        const count = typeof options?.count === "number" ? options.count : 0
        return `${count} Antworten`
      }

      return translations[key] ?? key
    },
  }),
}))

describe("DefaultQuestionTypeDisplay (Display/Kiosk, Issue #871)", () => {
  it("renders question type icon, label, and description", () => {
    const html = renderToStaticMarkup(<DefaultQuestionTypeDisplay type="choice" />)

    // Verify structure contains expected attributes
    expect(html).toContain('data-testid="question-type-display-choice"')
    expect(html).toContain('data-testid="question-type-icon"')
    expect(html).toContain('data-testid="question-type-label"')
    expect(html).toContain('data-testid="question-type-description"')

    // Verify content is rendered
    expect(html).toContain("Einfache Auswahl")
    expect(html).toContain("Eine Antwort auswählen")
  })

  it("renders response counter when responseCount is provided", () => {
    // Test with fixture containing answer responses
    const testResponses = ["Antwort A", "Antwort B", "Antwort A", "Antwort C"]
    const responseCount = testResponses.length

    const html = renderToStaticMarkup(
      <DefaultQuestionTypeDisplay type="multiple-select" responseCount={responseCount} />
    )

    // Verify counter is rendered with correct count
    expect(html).toContain('data-testid="response-counter"')
    expect(html).toContain("4 Antworten")
  })

  it("does not render counter when responseCount is undefined", () => {
    const html = renderToStaticMarkup(<DefaultQuestionTypeDisplay type="slider" />)

    // Verify counter element is not rendered
    expect(html).not.toContain('data-testid="response-counter"')
  })

  it("renders correctly with different question types", () => {
    const htmlBoolean = renderToStaticMarkup(
      <DefaultQuestionTypeDisplay type="boolean" />
    )
    expect(htmlBoolean).toContain('data-testid="question-type-display-boolean"')
    expect(htmlBoolean).toContain("Wahr/Falsch")

    const htmlMultiple = renderToStaticMarkup(
      <DefaultQuestionTypeDisplay type="multiple-select" />
    )
    expect(htmlMultiple).toContain('data-testid="question-type-display-multiple-select"')
    expect(htmlMultiple).toContain("Mehrfachauswahl")
  })

  it("applies custom className when provided", () => {
    const html = renderToStaticMarkup(
      <DefaultQuestionTypeDisplay type="choice" className="custom-class" />
    )

    expect(html).toContain("custom-class")
  })

  it("applies custom testIdPrefix when provided", () => {
    const html = renderToStaticMarkup(
      <DefaultQuestionTypeDisplay type="choice" testIdPrefix="custom-" />
    )

    expect(html).toContain('data-testid="custom-question-type-display-choice"')
    expect(html).toContain('data-testid="custom-question-type-icon"')
    expect(html).toContain('data-testid="custom-question-type-label"')
    expect(html).toContain('data-testid="custom-question-type-description"')
  })

  it("exports DefaultQuestionTypeDisplay function component", () => {
    expect(typeof DefaultQuestionTypeDisplay).toBe("function")
  })
})
