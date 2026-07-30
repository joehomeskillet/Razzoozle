import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import BrainstormDisplay from "./BrainstormDisplay"

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    container: () => ({ hidden: {}, visible: {} }),
    item: () => ({ hidden: {}, visible: {} }),
    spring: { type: "spring" },
    reduced: false,
  }),
}))

describe("BrainstormDisplay SSR Parity", () => {
  const defaultProps = {
    textResponses: {
      "Innovation is key": 7,
      "Teamwork matters": 5,
      "Be creative": 2,
    },
  }

  it("renders brainstorm text responses sorted by frequency (descending)", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    const innovationIndex = html.indexOf("Innovation is key")
    const teamworkIndex = html.indexOf("Teamwork matters")
    const creativeIndex = html.indexOf("Be creative")

    expect(innovationIndex).toBeLessThan(teamworkIndex)
    expect(teamworkIndex).toBeLessThan(creativeIndex)
  })

  it("renders response count for each brainstorm answer", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain(">7<")
    expect(html).toContain(">5<")
    expect(html).toContain(">2<")
  })

  it("renders all brainstorm entries as text content", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("Innovation is key")
    expect(html).toContain("Teamwork matters")
    expect(html).toContain("Be creative")
  })

  it("uses white background and border styling for brainstorm items", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("bg-white")
    expect(html).toContain("border")
    expect(html).toContain("border-[var(--border-hairline)]")
  })

  it("renders correct spacing and layout classes", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("rounded-xl")
    expect(html).toContain("px-5")
    expect(html).toContain("py-3")
    expect(html).toContain("gap-2")
  })

  it("contains scroll container for brainstorm responses", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("max-h-[40vh]")
    expect(html).toContain("overflow-y-auto")
  })

  it("renders items with flex layout for text and count separation", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("flex items-center justify-between")
  })

  it("renders empty list when textResponses is undefined", () => {
    const props = { textResponses: undefined }
    const html = renderToStaticMarkup(<BrainstormDisplay {...props} />)
    expect(html).toContain("max-h-[40vh]")
    expect(html).not.toContain("Innovation is key")
  })

  it("renders empty list when textResponses is empty object", () => {
    const props = { textResponses: {} }
    const html = renderToStaticMarkup(<BrainstormDisplay {...props} />)
    expect(html).toContain("max-h-[40vh]")
    expect(html).not.toContain("font-semibold")
  })

  it("applies responsive text sizing with clamp utility", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("lg:text-[clamp(1.25rem,3vh,2.5rem)]")
    expect(html).toContain("md:text-2xl")
  })

  it("applies font-semibold to text content", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("font-semibold")
  })

  it("applies font-bold to count display", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("font-bold")
  })

  it("renders items in motion animation container", () => {
    const html = renderToStaticMarkup(<BrainstormDisplay {...defaultProps} />)
    expect(html).toContain("flex-col")
    expect(html).toContain("gap-2")
  })
})
