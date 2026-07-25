import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { WordCloudDisplay } from "./WordCloudDisplay"

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

describe("WordCloudDisplay Component (Issue #467 / SDD #467)", () => {
  const sampleWords = [
    { text: "Antigravity", count: 12 },
    { text: "Razzoozle", count: 8 },
    { text: "Kahoot", count: 5 },
  ]

  it("renders empty state hint when words array is empty", () => {
    const html = renderToStaticMarkup(<WordCloudDisplay words={[]} />)
    expect(html).toContain("Warten auf Antworten der Spieler...")
    expect(html).toContain('data-testid="word-cloud-empty"')
  })

  it("renders all word items with counts", () => {
    const html = renderToStaticMarkup(<WordCloudDisplay words={sampleWords} />)
    expect(html).toContain("Antigravity")
    expect(html).toContain("(12)")
    expect(html).toContain("Razzoozle")
    expect(html).toContain("(8)")
    expect(html).toContain("Kahoot")
    expect(html).toContain("(5)")
  })

  it("applies dynamic font sizes scaling with count ratio", () => {
    const html = renderToStaticMarkup(<WordCloudDisplay words={sampleWords} />)
    // Max count is 12 (ratio 1.0) -> font-size: 2.50rem
    expect(html).toContain("font-size:2.50rem")
  })

  it("supports testIdPrefix prop for solo/display contexts", () => {
    const html = renderToStaticMarkup(
      <WordCloudDisplay words={sampleWords} testIdPrefix="kiosk-" />
    )
    expect(html).toContain('data-testid="kiosk-word-cloud-container"')
    expect(html).toContain('data-testid="kiosk-word-cloud-item-Antigravity"')
  })

  it("limits rendering to maxWords prop ceiling", () => {
    const html = renderToStaticMarkup(
      <WordCloudDisplay words={sampleWords} maxWords={2} />
    )
    expect(html).toContain("Antigravity")
    expect(html).toContain("Razzoozle")
    expect(html).not.toContain("Kahoot")
  })

  it("exports WordCloudDisplay function component", () => {
    expect(typeof WordCloudDisplay).toBe("function")
  })
})
