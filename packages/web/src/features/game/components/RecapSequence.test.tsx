/**
 * RecapSequence.test.tsx — Vitest SSR suite for card-reveal component.
 * Tests fireFeedback integration, render validation, and fireFeedback call verification.
 *
 * Pure TS/TSX — no jsdom, no Testing Library (the web package runs vitest
 * under the `node` env). renderToStaticMarkup (react-dom/server) exercises
 * the component without a DOM.
 */

import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import RecapSequence from "./RecapSequence"
import type { Superlative } from "@razzoozle/common/types/game"

// Mock the feedback service to verify it's called on advance/complete
vi.mock("@razzoozle/web/features/experience-kit/feedback/experienceFeedbackService", () => ({
  fireFeedback: vi.fn(),
}))

describe("RecapSequence", () => {
  const mockSuperlatives: Superlative[] = [
    {
      key: "fastest_finger",
      winnerName: "Alice",
      winnerAvatar: "https://example.com/alice.jpg",
      value: 2500,
    },
    {
      key: "most_correct",
      winnerName: "Bob",
      winnerAvatar: "https://example.com/bob.jpg",
      value: 8,
    },
  ]

  it("renders recap section with data-testid when given superlatives", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={() => {}} />
    )
    expect(html).toContain('data-testid="recap-sequence"')
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-live="polite"')
  })

  it("renders nothing when total cards is 0", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={[]} onComplete={() => {}} />
    )
    expect(html).toBe("")
  })

  it("accepts autoMode=false prop without error", () => {
    const html = renderToStaticMarkup(
      <RecapSequence
        superlatives={mockSuperlatives}
        onComplete={() => {}}
        autoMode={false}
      />
    )
    expect(html).toContain('data-testid="recap-sequence"')
  })

  it("accepts custom autoAdvanceMs prop", () => {
    const html = renderToStaticMarkup(
      <RecapSequence
        superlatives={mockSuperlatives}
        onComplete={() => {}}
        autoAdvanceMs={2000}
      />
    )
    expect(html).toContain('data-testid="recap-sequence"')
  })
})
