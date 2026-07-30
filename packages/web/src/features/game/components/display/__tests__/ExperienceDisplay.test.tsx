// Unit tests for ExperienceDisplay component.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ExperienceDisplay } from "../ExperienceDisplay"

describe("ExperienceDisplay — Content-Free Display", () => {
  it("renders phase name", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "pyramidClimb", phase: "question" }} />,
    )
    expect(markup).toContain("question")
  })

  it("renders answered and total counts", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "pyramidClimb", phase: "question", answered: 7, total: 12 }} />,
    )
    expect(markup).toContain(">7<")
    expect(markup).toContain(" / 12")
  })

  it("calculates progress percentage", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay
        data={{ mode: "pyramidClimb", phase: "question", answered: 5, total: 10 }}
      />,
    )
    expect(markup).toContain("50%")
  })

  it("does not render question-text testid (content-free)", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "deepSeaEscape", phase: "answers_locked", answered: 3, total: 10 }} />,
    )
    expect(markup).not.toContain('data-testid="question-text"')
  })

  it("defaults answered and total to 0 when absent", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "classic", phase: "intro" }} />,
    )
    expect(markup).toContain(">0<")
    expect(markup).toContain("0%")
  })
})
