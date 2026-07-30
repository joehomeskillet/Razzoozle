import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { QuestionTypeSelector } from "../QuestionTypeSelector"

describe("QuestionTypeSelector (SSR Smoke Test)", () => {
  it("renders radiogroup container with testid", () => {
    const html = renderToStaticMarkup(
      <QuestionTypeSelector
        currentType="choice"
        onTypeChange={vi.fn()}
      />
    )
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('data-testid="question-type-list"')
  })

  it("renders radio options with aria-checked", () => {
    const html = renderToStaticMarkup(
      <QuestionTypeSelector
        currentType="choice"
        onTypeChange={vi.fn()}
      />
    )
    expect(html).toContain('role="radio"')
    expect(html).toContain('aria-checked')
    expect(html).toContain('data-testid="question-type-option-')
  })
})
