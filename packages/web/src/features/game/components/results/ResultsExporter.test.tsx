import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ResultsExporter, type PodiumEntry } from "./ResultsExporter"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

describe("ResultsExporter Component (Issue #478 / SDD #478)", () => {
  const samplePodium: PodiumEntry[] = [
    { rank: 1, username: "ChampAlice", score: 2400 },
    { rank: 2, username: "RunnerBob", score: 1950 },
    { rank: 3, username: "ProCharlie", score: 1800 },
  ]

  it("renders export title, quiz title, and participant count", () => {
    const html = renderToStaticMarkup(
      <ResultsExporter
        quizTitle="Wissenschafts-Quiz"
        podium={samplePodium}
        totalParticipants={42}
      />
    )

    expect(html).toContain("Ergebnisse exportieren")
    expect(html).toContain("Wissenschafts-Quiz • 42 Spieler")
  })

  it("renders podium preview for top winners", () => {
    const html = renderToStaticMarkup(
      <ResultsExporter
        quizTitle="Wissenschafts-Quiz"
        podium={samplePodium}
        totalParticipants={42}
      />
    )

    expect(html).toContain("#1 ChampAlice")
    expect(html).toContain("2400 Pkt.")
    expect(html).toContain("#2 RunnerBob")
  })

  it("renders export buttons for PNG, PDF, and CSV when callbacks provided", () => {
    const html = renderToStaticMarkup(
      <ResultsExporter
        quizTitle="Test"
        podium={samplePodium}
        totalParticipants={10}
        onExportPng={vi.fn()}
        onExportPdf={vi.fn()}
        onExportCsv={vi.fn()}
      />
    )

    expect(html).toContain('data-testid="export-png"')
    expect(html).toContain('data-testid="export-pdf"')
    expect(html).toContain('data-testid="export-csv"')
  })

  it("supports testIdPrefix prop for custom isolation", () => {
    const html = renderToStaticMarkup(
      <ResultsExporter
        quizTitle="Test"
        podium={samplePodium}
        totalParticipants={10}
        testIdPrefix="solo-"
      />
    )

    expect(html).toContain('data-testid="solo-results-exporter"')
    expect(html).toContain('data-testid="solo-results-podium-preview"')
  })

  it("disables export buttons when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <ResultsExporter
        quizTitle="Test"
        podium={samplePodium}
        totalParticipants={10}
        onExportPng={vi.fn()}
        disabled={true}
      />
    )

    expect(html).toContain("disabled")
  })

  it("exports ResultsExporter function component", () => {
    expect(typeof ResultsExporter).toBe("function")
  })
})
