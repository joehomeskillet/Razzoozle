import { describe, test, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import MultiSelectGrid from "./MultiSelectGrid"

// Mock i18next and motion/react for node-based rendering
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
  motion: {
    div: ({ children, className, "data-testid": testId }: any) => (
      <div className={className} data-testid={testId}>
        {children}
      </div>
    ),
  },
}))

describe("MultiSelectGrid — Parity RED Characterization (Issue #319 / WP #435)", () => {
  const defaultAnswers = ["Option A", "Option B", "Option C", "Option D"]

  describe("Passing baseline characterization", () => {
    test("renders all answer choices and submit button", () => {
      const html = renderToStaticMarkup(
        <MultiSelectGrid
          value={[]}
          disabled={false}
          onChange={() => {}}
          onSubmit={() => {}}
          answers={defaultAnswers}
        />
      )
      expect(html).toContain("Option A")
      expect(html).toContain("Option B")
      expect(html).toContain("Option C")
      expect(html).toContain("Option D")
      expect(html).toContain("multi-select-submit")
    })

    test("disables submit button when no options are selected", () => {
      const html = renderToStaticMarkup(
        <MultiSelectGrid
          value={[]}
          disabled={false}
          onChange={() => {}}
          onSubmit={() => {}}
          answers={defaultAnswers}
        />
      )
      // Submit button should have disabled attribute when value is empty
      const match = /<button[^>]*data-testid="multi-select-submit"[^>]*>/.exec(html)
      expect(match).toBeTruthy()
      expect(match![0]).toMatch(/\sdisabled(=|"|>)/)
    })

    test("enables submit button when at least one option is selected", () => {
      const html = renderToStaticMarkup(
        <MultiSelectGrid
          value={[0]}
          disabled={false}
          onChange={() => {}}
          onSubmit={() => {}}
          answers={defaultAnswers}
        />
      )
      // Submit button should NOT have disabled attribute when value is non-empty
      const match = /<button[^>]*data-testid="multi-select-submit"[^>]*>/.exec(html)
      expect(match).toBeTruthy()
      expect(match![0]).not.toMatch(/\sdisabled(=|"|>)/)
    })
  })

  describe("RED Parity Failures (Target behavior to be fixed in WP #436 / #319)", () => {
    test("1. Selected tiles expose explicit ARIA selection state (aria-selected='true' or aria-pressed='true')", () => {
      const html = renderToStaticMarkup(
        <MultiSelectGrid
          value={[1]}
          disabled={false}
          onChange={() => {}}
          onSubmit={() => {}}
          answers={defaultAnswers}
        />
      )
      // Tile 1 (Option B, answer-btn-1) is selected. It MUST have aria-selected="true" or aria-pressed="true"
      const tile1Match = /<button[^>]*data-testid="answer-btn-1"[^>]*>/.exec(html)
      expect(tile1Match).toBeTruthy()
      const tile1Tag = tile1Match![0]
      
      const hasAriaSelected = tile1Tag.includes('aria-selected="true"') || tile1Tag.includes('aria-pressed="true"')
      expect(hasAriaSelected).toBe(true)
    })

    test("2. Disabled state maintains selected emphasis (ring) and dims ONLY unselected tiles", () => {
      const html = renderToStaticMarkup(
        <MultiSelectGrid
          value={[0]}
          disabled={true}
          onChange={() => {}}
          onSubmit={() => {}}
          answers={defaultAnswers}
        />
      )

      // Tile 0 (selected) must keep selection ring and NOT receive unselected dimming (opacity-40)
      const tile0Match = /<button[^>]*data-testid="answer-btn-0"[^>]*>/.exec(html)
      expect(tile0Match).toBeTruthy()
      const tile0Tag = tile0Match![0]

      // Selected tile must have ring-selected
      expect(tile0Tag).toContain("ring-[var(--ring-selected)]")
      // Selected tile must NOT be dimmed with opacity-50 or opacity-40
      expect(tile0Tag).not.toContain("opacity-50")
      expect(tile0Tag).not.toContain("opacity-40")

      // Tile 1 (unselected) must receive opacity-40 dimming
      const tile1Match = /<button[^>]*data-testid="answer-btn-1"[^>]*>/.exec(html)
      expect(tile1Match).toBeTruthy()
      const tile1Tag = tile1Match![0]
      expect(tile1Tag).toContain("opacity-40")
    })

    test("3. Geometry parity with ChoiceGrid (min-h-14/min-h-16, col-span-2 on 3-item 3rd tile, break-words)", () => {
      const threeAnswers = ["Option A", "Option B", "Option C"]
      const html = renderToStaticMarkup(
        <MultiSelectGrid
          value={[]}
          disabled={false}
          onChange={() => {}}
          onSubmit={() => {}}
          answers={threeAnswers}
        />
      )

      // Tiles must specify minimum height class (min-h-14 or min-h-16) and text wrapping (break-words)
      const tile0Match = /<button[^>]*data-testid="answer-btn-0"[^>]*>/.exec(html)
      expect(tile0Match).toBeTruthy()
      const tile0Tag = tile0Match![0]
      expect(tile0Tag).toMatch(/min-h-14|min-h-16/)
      expect(tile0Tag).toContain("break-words")

      // 3rd tile in a 3-item grid must span 2 columns (col-span-2)
      const tile2Match = /<button[^>]*data-testid="answer-btn-2"[^>]*>/.exec(html)
      expect(tile2Match).toBeTruthy()
      const tile2Tag = tile2Match![0]
      expect(tile2Tag).toContain("col-span-2")
    })
  })
})
