import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { AssignmentRunner } from "./AssignmentRunner"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; date?: string; completed?: number; total?: number; current?: number }) => {
      let str = options?.defaultValue ?? key
      if (options?.date) str = str.replace("{{date}}", options.date)
      if (options?.completed !== undefined) str = str.replace("{{completed}}", String(options.completed))
      if (options?.total !== undefined) str = str.replace("{{total}}", String(options.total))
      if (options?.current !== undefined) str = str.replace("{{current}}", String(options.current))
      return str
    },
  }),
}))

describe("AssignmentRunner Component (Issue #471 / SDD #471)", () => {
  const sampleItems = [
    { id: "q1", questionText: "Was ist die Hauptkanal-Farbe?", answered: true },
    { id: "q2", questionText: "Wie viele Fragetypen gibt es?", answered: false },
  ]

  it("renders assignment title and deadline banner", () => {
    const html = renderToStaticMarkup(
      <AssignmentRunner
        title="Hausaufgabe Mathematik"
        deadline="2026-07-30"
        items={sampleItems}
      />
    )

    expect(html).toContain("Hausaufgabe Mathematik")
    expect(html).toContain("Fällig bis: 2026-07-30")
    expect(html).toContain("1 von 2 gelöst")
  })

  it("renders current question text and question counter", () => {
    const html = renderToStaticMarkup(
      <AssignmentRunner
        title="Hausaufgabe Mathematik"
        deadline="2026-07-30"
        items={sampleItems}
      />
    )

    expect(html).toContain("Was ist die Hauptkanal-Farbe?")
    expect(html).toContain("Frage 1 von 2")
  })

  it("supports testIdPrefix prop for custom test isolation", () => {
    const html = renderToStaticMarkup(
      <AssignmentRunner
        title="Hausaufgabe"
        deadline="2026-07-30"
        items={sampleItems}
        testIdPrefix="solo-"
      />
    )

    expect(html).toContain('data-testid="solo-assignment-container"')
    expect(html).toContain('data-testid="solo-assignment-item-q1"')
    expect(html).toContain('data-testid="solo-assignment-next"')
  })

  it("disables next button when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <AssignmentRunner
        title="Hausaufgabe"
        deadline="2026-07-30"
        items={sampleItems}
        disabled={true}
      />
    )

    expect(html).toContain("disabled")
    expect(html).toContain("cursor-not-allowed")
  })

  it("renders auto-save indicator hint in footer", () => {
    const html = renderToStaticMarkup(
      <AssignmentRunner
        title="Hausaufgabe"
        deadline="2026-07-30"
        items={sampleItems}
      />
    )

    expect(html).toContain("Fortschritt wird automatisch gespeichert")
  })

  it("exports AssignmentRunner function component", () => {
    expect(typeof AssignmentRunner).toBe("function")
  })
})
