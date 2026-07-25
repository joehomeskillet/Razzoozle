import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { QaModerationPanel, type QaQuestion } from "./QaModerationPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

describe("QaModerationPanel Component (Issue #474 / SDD #474)", () => {
  const sampleQuestions: QaQuestion[] = [
    { id: "q1", text: "Wann wird das neue Release gelauncht?", authorName: "Alice", upvotes: 14, status: "pending" },
    { id: "q2", text: "Gibt es Support für Rust Server?", authorName: "Bob", upvotes: 8, status: "approved", isPinned: true },
  ]

  it("renders moderation title and default pending tab with questions", () => {
    const html = renderToStaticMarkup(
      <QaModerationPanel questions={sampleQuestions} />
    )

    expect(html).toContain("Q&amp;A Live Moderation")
    expect(html).toContain("Wann wird das neue Release gelauncht?")
    expect(html).toContain("14 Stimmen")
  })

  it("renders tab buttons for pending, approved, and dismissed", () => {
    const html = renderToStaticMarkup(
      <QaModerationPanel questions={sampleQuestions} />
    )

    expect(html).toContain('data-testid="qa-tab-pending"')
    expect(html).toContain('data-testid="qa-tab-approved"')
    expect(html).toContain('data-testid="qa-tab-dismissed"')
  })

  it("renders approve and dismiss action buttons on pending questions", () => {
    const html = renderToStaticMarkup(
      <QaModerationPanel
        questions={sampleQuestions}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />
    )

    expect(html).toContain('data-testid="qa-approve-q1"')
    expect(html).toContain('data-testid="qa-dismiss-q1"')
  })

  it("supports testIdPrefix prop for custom isolation", () => {
    const html = renderToStaticMarkup(
      <QaModerationPanel questions={sampleQuestions} testIdPrefix="console-" />
    )

    expect(html).toContain('data-testid="console-qa-moderation-panel"')
    expect(html).toContain('data-testid="console-qa-tab-pending"')
  })

  it("disables action buttons when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <QaModerationPanel
        questions={sampleQuestions}
        onApprove={vi.fn()}
        disabled={true}
      />
    )

    expect(html).toContain("disabled")
  })

  it("exports QaModerationPanel function component", () => {
    expect(typeof QaModerationPanel).toBe("function")
  })
})
