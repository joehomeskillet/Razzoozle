import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MicroLessonViewer } from "./MicroLessonViewer"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; current?: number; total?: number }) => {
      let str = options?.defaultValue ?? key
      if (options?.current) str = str.replace("{{current}}", String(options.current))
      if (options?.total) str = str.replace("{{total}}", String(options.total))
      return str
    },
  }),
}))

describe("MicroLessonViewer Component (Issue #470 / SDD #470)", () => {
  const sampleSlides = [
    { id: "slide-1", title: "Einführung in Antigravity", content: "Antigravity ist das neue Agentic Platform System.", type: "text" as const },
    { id: "slide-2", title: "Architektur", content: "Monorepo mit Node, Socket.io und Rust Backend.", type: "text" as const },
  ]

  it("renders first slide title and content initially", () => {
    const html = renderToStaticMarkup(
      <MicroLessonViewer slides={sampleSlides} />
    )

    expect(html).toContain("Einführung in Antigravity")
    expect(html).toContain("Antigravity ist das neue Agentic Platform System.")
    expect(html).toContain("Folie 1 von 2")
  })

  it("renders slide counter and dots container", () => {
    const html = renderToStaticMarkup(
      <MicroLessonViewer slides={sampleSlides} />
    )

    expect(html).toContain('data-testid="microlesson-dots"')
    expect(html).toContain('data-testid="microlesson-slide-slide-1"')
  })

  it("disables prev button on first slide", () => {
    const html = renderToStaticMarkup(
      <MicroLessonViewer slides={sampleSlides} />
    )

    expect(html).toContain('data-testid="microlesson-prev"')
    expect(html).toContain("disabled")
  })

  it("supports testIdPrefix prop for custom test isolation", () => {
    const html = renderToStaticMarkup(
      <MicroLessonViewer slides={sampleSlides} testIdPrefix="kiosk-" />
    )

    expect(html).toContain('data-testid="kiosk-microlesson-container"')
    expect(html).toContain('data-testid="kiosk-microlesson-prev"')
    expect(html).toContain('data-testid="kiosk-microlesson-next"')
  })

  it("renders image media element when type is image", () => {
    const mediaSlides = [
      { id: "slide-1", title: "Image Slide", content: "Description", type: "image" as const, mediaUrl: "https://example.com/demo.png" },
    ]

    const html = renderToStaticMarkup(
      <MicroLessonViewer slides={mediaSlides} />
    )

    expect(html).toContain('src="https://example.com/demo.png"')
  })

  it("exports MicroLessonViewer function component", () => {
    expect(typeof MicroLessonViewer).toBe("function")
  })
})
