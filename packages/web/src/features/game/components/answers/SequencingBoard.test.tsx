import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { SequencingBoard } from "./SequencingBoard"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; label?: string }) => {
      let str = options?.defaultValue ?? key
      if (options?.label) {
        str = str.replace("{{label}}", options.label)
      }
      return str
    },
  }),
}))

describe("SequencingBoard Component (Issue #466 / SDD #466)", () => {
  const initialValue = {
    bank: [
      { id: "item-1", label: "First Step" },
      { id: "item-2", label: "Second Step" },
      { id: "item-3", label: "Third Step" },
    ],
    placed: [],
  }

  it("renders empty hint and all bank items initially", () => {
    const html = renderToStaticMarkup(
      <SequencingBoard
        value={initialValue}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={false}
      />
    )

    expect(html).toContain("Tap items below to order them")
    expect(html).toContain("First Step")
    expect(html).toContain("Second Step")
    expect(html).toContain("Third Step")
  })

  it("renders placed chips correctly when placed array has items", () => {
    const placedValue = {
      bank: [{ id: "item-3", label: "Third Step" }],
      placed: [
        { id: "item-1", label: "First Step" },
        { id: "item-2", label: "Second Step" },
      ],
    }

    const html = renderToStaticMarkup(
      <SequencingBoard
        value={placedValue}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={false}
      />
    )

    expect(html).toContain("First Step")
    expect(html).toContain("Second Step")
    expect(html).toContain("Third Step")
    expect(html).toContain("Remove First Step")
  })

  it("disables buttons when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <SequencingBoard
        value={initialValue}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={true}
      />
    )

    expect(html).toContain("disabled")
    expect(html).toContain("cursor-not-allowed")
  })

  it("renders with solo test-id attributes when testIdPrefix is solo-", () => {
    const html = renderToStaticMarkup(
      <SequencingBoard
        value={initialValue}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={false}
        testIdPrefix="solo-"
      />
    )

    expect(html).toContain('data-testid="solo-sequencing-answer-bar"')
    expect(html).toContain('data-testid="solo-sequencing-bank"')
  })

  it("renders correct feedback state classes when feedback prop is provided", () => {
    const htmlCorrect = renderToStaticMarkup(
      <SequencingBoard
        value={initialValue}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={false}
        feedback={{ correct: true }}
      />
    )
    expect(htmlCorrect).toContain("bg-[var(--state-correct)]")

    const htmlWrong = renderToStaticMarkup(
      <SequencingBoard
        value={initialValue}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={false}
        feedback={{ correct: false }}
      />
    )
    expect(htmlWrong).toContain("bg-[var(--state-wrong)]")
  })

  it("exports SequencingBoard component matching AnswerViewProps contract", () => {
    expect(typeof SequencingBoard).toBe("function")
  })
})
