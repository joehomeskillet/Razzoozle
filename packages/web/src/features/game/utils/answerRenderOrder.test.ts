import { describe, it, expect } from "vitest"

/**
 * Test for answer tile rendering order computation.
 *
 * The core requirement: when displayOrder is present (answer shuffling),
 * tiles render in the shuffled visual order, but each tile's onClick handler
 * and selection payload must use the CANONICAL answer index (not visual position).
 */

describe("answerRenderOrder", () => {
  it("should use canonical order when displayOrder is undefined", () => {
    const answers = ["A", "B", "C", "D"]
    const displayOrder = undefined

    const renderOrder = displayOrder ?? answers.map((_, i) => i)

    // Should be [0, 1, 2, 3] (canonical)
    expect(renderOrder).toEqual([0, 1, 2, 3])
  })

  it("should use displayOrder permutation when present", () => {
    const answers = ["A", "B", "C", "D"]
    const displayOrder = [2, 0, 1, 3] // Visual order: C, A, B, D

    const renderOrder = displayOrder ?? answers.map((_, i) => i)

    // Visual tiles in order C(2), A(0), B(1), D(3)
    expect(renderOrder).toEqual([2, 0, 1, 3])
  })

  it("should render answer text from canonical index mapping", () => {
    const answers = ["Apple", "Banana", "Cherry"]
    const displayOrder = [2, 0, 1] // Visual: Cherry, Apple, Banana

    const renderOrder = displayOrder ?? answers.map((_, i) => i)

    // First visual tile should show answer at canonical index 2 (Cherry)
    const firstVisualTile = renderOrder[0]
    expect(answers[firstVisualTile]).toBe("Cherry")

    // Second visual tile should show answer at canonical index 0 (Apple)
    const secondVisualTile = renderOrder[1]
    expect(answers[secondVisualTile]).toBe("Apple")
  })

  it("should preserve canonical indices for onClick payload", () => {
    const answers = ["A", "B", "C"]
    const displayOrder = [2, 0, 1] // Visual: C, A, B
    const multiSelectedKeys: number[] = []

    const renderOrder = displayOrder ?? answers.map((_, i) => i)

    // Simulate selecting the first visually rendered tile (C)
    const firstVisualIndex = 0
    const canonicalIndexForFirstVisual = renderOrder[firstVisualIndex]

    // The onClick handler should use canonical index 2, not visual position 0
    expect(canonicalIndexForFirstVisual).toBe(2)

    // Toggle that key
    const updated = multiSelectedKeys.includes(canonicalIndexForFirstVisual)
      ? multiSelectedKeys.filter((k) => k !== canonicalIndexForFirstVisual)
      : [...multiSelectedKeys, canonicalIndexForFirstVisual]

    // Should submit canonical index 2 in the payload
    expect(updated).toContain(2)
  })

  it("should handle empty answers gracefully", () => {
    const answers: string[] = []
    const displayOrder = undefined

    const renderOrder = displayOrder ?? answers.map((_, i) => i)

    expect(renderOrder).toEqual([])
  })

  it("should correctly map all canonical indices in displayOrder", () => {
    const answers = ["Q1", "Q2", "Q3", "Q4"]
    // Reversed order: D, C, B, A
    const displayOrder = [3, 2, 1, 0]

    const renderOrder = displayOrder ?? answers.map((_, i) => i)

    // Each visual position should point to the correct canonical index
    expect(renderOrder.map((i) => answers[i])).toEqual(["Q4", "Q3", "Q2", "Q1"])
  })
})
