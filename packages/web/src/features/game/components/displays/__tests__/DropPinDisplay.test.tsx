import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { DropPinDisplay } from "../DropPinDisplay"

// Mock translations and animation hooks
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "game:dropPin.correctLocation": "Correct Location",
      }
      return translations[key] || key
    },
  }),
}))

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    item: () => ({}),
    container: () => ({}),
    spring: {},
    reduced: false,
  }),
}))

describe("DropPinDisplay", () => {
  it("renders nothing when no content is provided", () => {
    const html = renderToStaticMarkup(<DropPinDisplay />)
    expect(html).toBe("")
  })

  it("renders nothing when all props are empty or null", () => {
    const html = renderToStaticMarkup(
      <DropPinDisplay
        media={undefined}
        correctAnswer={undefined}
        correctHotspotIndex={null}
      />
    )
    expect(html).toBe("")
  })

  it("renders with image only", () => {
    const html = renderToStaticMarkup(
      <DropPinDisplay media={{ url: "https://example.com/image.jpg" }} />
    )

    expect(html).toContain("https://example.com/image.jpg")
    expect(html).toContain("Correct Location")
  })

  it("renders with correct answer only", () => {
    const html = renderToStaticMarkup(
      <DropPinDisplay correctAnswer="Zone A" />
    )

    expect(html).toContain("Zone A")
    expect(html).toContain("bg-[var(--state-correct)]")
  })

  it("renders with hotspot index only", () => {
    const html = renderToStaticMarkup(
      <DropPinDisplay correctHotspotIndex={0} />
    )

    expect(html).toContain("Correct Location")
  })

  it("renders with all content", () => {
    const html = renderToStaticMarkup(
      <DropPinDisplay
        media={{ url: "https://example.com/image.jpg" }}
        correctAnswer="Zone B"
        correctHotspotIndex={1}
      />
    )

    expect(html).toContain("https://example.com/image.jpg")
    expect(html).toContain("Correct Location")
    expect(html).toContain("Zone B")
  })

  it("includes proper CSS classes for styling", () => {
    const html = renderToStaticMarkup(
      <DropPinDisplay media={{ url: "test.jpg" }} />
    )

    expect(html).toContain("text-center")
    expect(html).toContain("shadow-[var(--shadow-flat)]")
    expect(html).toContain("rounded-[var(--radius-theme)]")
  })
})
