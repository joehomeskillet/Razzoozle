import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { QuizVersionHistoryModal, type QuizVersion } from "./QuizVersionHistoryModal"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

describe("QuizVersionHistoryModal Component (Issue #480 / SDD #480)", () => {
  const sampleVersions: QuizVersion[] = [
    { version: 2, updatedAt: "2026-07-25 14:00", authorName: "Alice", description: "Fragen 5-8 hinzugefügt", questionCount: 8, isCurrent: true },
    { version: 1, updatedAt: "2026-07-20 10:30", authorName: "Bob", description: "Initiale Erstellung", questionCount: 4, isCurrent: false },
  ]

  it("renders modal title and quiz name header", () => {
    const html = renderToStaticMarkup(
      <QuizVersionHistoryModal
        quizTitle="Mathe Olympiade"
        versions={sampleVersions}
      />
    )

    expect(html).toContain("Versionsverlauf")
    expect(html).toContain("Mathe Olympiade")
  })

  it("renders list of version cards with current version badge", () => {
    const html = renderToStaticMarkup(
      <QuizVersionHistoryModal
        quizTitle="Mathe Olympiade"
        versions={sampleVersions}
      />
    )

    expect(html).toContain("v2")
    expect(html).toContain("Aktuell")
    expect(html).toContain("Fragen 5-8 hinzugefügt")
    expect(html).toContain("v1")
    expect(html).toContain("Initiale Erstellung")
  })

  it("renders restore action button for non-current versions", () => {
    const html = renderToStaticMarkup(
      <QuizVersionHistoryModal
        quizTitle="Mathe Olympiade"
        versions={sampleVersions}
        onRestore={vi.fn()}
      />
    )

    expect(html).toContain('data-testid="version-restore-v1"')
    expect(html).not.toContain('data-testid="version-restore-v2"')
  })

  it("supports testIdPrefix prop for custom isolation", () => {
    const html = renderToStaticMarkup(
      <QuizVersionHistoryModal
        quizTitle="Test"
        versions={sampleVersions}
        testIdPrefix="console-"
      />
    )

    expect(html).toContain('data-testid="console-version-history-modal"')
    expect(html).toContain('data-testid="console-version-item-v2"')
  })

  it("disables restore buttons when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <QuizVersionHistoryModal
        quizTitle="Test"
        versions={sampleVersions}
        onRestore={vi.fn()}
        disabled={true}
      />
    )

    expect(html).toContain("disabled")
  })

  it("exports QuizVersionHistoryModal function component", () => {
    expect(typeof QuizVersionHistoryModal).toBe("function")
  })
})
