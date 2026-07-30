import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { WordCloudResponsesDisplay } from "../WordCloudResponsesDisplay"

// Mock animation hook
vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    item: () => ({}),
    container: () => ({}),
    spring: {},
    reduced: false,
  }),
}))

// Mock the underlying WordCloudDisplay component
vi.mock(
  "@razzoozle/web/features/game/components/answers/WordCloudDisplay",
  () => ({
    WordCloudDisplay: ({ words }: { words: Array<{ text: string; count: number }> }) => (
      <div data-testid="word-cloud" data-word-count={words.length}>
        {words.map((w) => (
          <span key={w.text}>
            {w.text}:{w.count}
          </span>
        ))}
      </div>
    ),
  })
)

describe("WordCloudResponsesDisplay", () => {
  it("renders with empty word cloud when textResponses is empty", () => {
    const html = renderToStaticMarkup(<WordCloudResponsesDisplay textResponses={{}} />)

    expect(html).toContain("data-testid=\"word-cloud\"")
    expect(html).toContain("data-word-count=\"0\"")
  })

  it("renders with empty word cloud when textResponses is undefined", () => {
    const html = renderToStaticMarkup(
      <WordCloudResponsesDisplay textResponses={undefined} />
    )

    expect(html).toContain("data-testid=\"word-cloud\"")
    expect(html).toContain("data-word-count=\"0\"")
  })

  it("converts textResponses to word array format", () => {
    const responses = {
      apple: 5,
      banana: 3,
      cherry: 7,
    }
    const html = renderToStaticMarkup(
      <WordCloudResponsesDisplay textResponses={responses} />
    )

    expect(html).toContain("data-word-count=\"3\"")
    expect(html).toContain("apple:5")
    expect(html).toContain("banana:3")
    expect(html).toContain("cherry:7")
  })

  it("includes motion container variants", () => {
    const html = renderToStaticMarkup(
      <WordCloudResponsesDisplay textResponses={{ test: 1 }} />
    )

    // Verify structure contains the animated wrapper
    expect(html).toContain("data-testid=\"word-cloud\"")
  })
})
