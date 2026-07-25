import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { BrainstormBoard } from "./BrainstormBoard"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; text?: string; count?: number }) => {
      let str = options?.defaultValue ?? key
      if (options?.text) str = str.replace("{{text}}", options.text)
      if (options?.count !== undefined) str = str.replace("{{count}}", String(options.count))
      return str
    },
  }),
}))

describe("BrainstormBoard Component (Issue #468 / SDD #468)", () => {
  const sampleIdeas = [
    { id: "idea-1", text: "Better dark mode themes", authorName: "Alice", upvotes: 5 },
    { id: "idea-2", text: "More sound effects", authorName: "Bob", upvotes: 12 },
    { id: "idea-3", text: "Offline practice mode", authorName: "Charlie", upvotes: 2 },
  ]

  it("renders empty state placeholder when ideas array is empty", () => {
    const html = renderToStaticMarkup(<BrainstormBoard ideas={[]} />)
    expect(html).toContain("Noch keine Ideen eingereicht. Sei der Erste!")
    expect(html).toContain('data-testid="brainstorm-empty"')
  })

  it("renders sorted idea cards by upvotes descending", () => {
    const html = renderToStaticMarkup(<BrainstormBoard ideas={sampleIdeas} />)
    expect(html).toContain("More sound effects")
    expect(html).toContain("12")
    expect(html).toContain("Better dark mode themes")
    expect(html).toContain("5")
    expect(html).toContain("Offline practice mode")
    expect(html).toContain("2")
  })

  it("renders submission form when onAddIdea is provided", () => {
    const html = renderToStaticMarkup(
      <BrainstormBoard ideas={sampleIdeas} onAddIdea={vi.fn()} />
    )
    expect(html).toContain('data-testid="brainstorm-form"')
    expect(html).toContain('data-testid="brainstorm-input"')
    expect(html).toContain('data-testid="brainstorm-submit"')
  })

  it("supports testIdPrefix prop for custom test isolation", () => {
    const html = renderToStaticMarkup(
      <BrainstormBoard ideas={sampleIdeas} testIdPrefix="kiosk-" />
    )
    expect(html).toContain('data-testid="kiosk-brainstorm-board"')
    expect(html).toContain('data-testid="kiosk-brainstorm-card-idea-1"')
  })

  it("disables upvote buttons when disabled prop is true or hasVoted is set", () => {
    const votedIdeas = [
      { id: "idea-1", text: "Idea 1", upvotes: 3, hasVoted: true },
    ]

    const htmlDisabled = renderToStaticMarkup(
      <BrainstormBoard ideas={votedIdeas} disabled={true} />
    )
    expect(htmlDisabled).toContain("disabled")

    const htmlVoted = renderToStaticMarkup(
      <BrainstormBoard ideas={votedIdeas} disabled={false} />
    )
    expect(htmlVoted).toContain("disabled")
  })

  it("exports BrainstormBoard function component", () => {
    expect(typeof BrainstormBoard).toBe("function")
  })
})
