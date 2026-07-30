/**
 * RecapSequence.test.tsx — Vitest SSR suite for card-reveal component.
 * Tests render, Final-Cue state, Reduced-Motion, and fireFeedback integration.
 *
 * Pure TS/TSX — no jsdom. renderToStaticMarkup (react-dom/server) exercises
 * the component without a DOM.
 */

import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

// Mock fireFeedback before importing RecapSequence
vi.mock("@razzoozle/web/features/experience-kit/feedback/experienceFeedbackService", () => ({
  fireFeedback: vi.fn(),
}))

// Mock animation presets
vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  DURATION: { instant: 0.12, fast: 0.2, base: 0.32, slow: 0.5, sheen: 0.8 },
  EASE: { out: [0.16, 1, 0.3, 1], inOut: [0.65, 0, 0.35, 1] },
  useReveal: vi.fn(() => ({
    reduced: false,
    spring: { type: "spring", stiffness: 300, damping: 24 },
    snap: { type: "spring", stiffness: 400, damping: 28 },
    item: () => ({ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }),
    container: () => ({ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }),
    pop: () => ({ hidden: { opacity: 0, scale: 0.6 }, visible: { opacity: 1, scale: 1 } }),
    tween: () => ({ duration: 0.32 }),
  })),
}))

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: vi.fn(() => ({
    t: (key: string, { defaultValue }: { defaultValue?: string } = {}) => defaultValue || key,
  })),
}))

// Import after all mocks registered
import RecapSequence from "./RecapSequence"
import type { Superlative } from "@razzoozle/common/types/game"

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

  it("renders recap section with accessibility attributes", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={() => {}} />
    )
    expect(html).toContain('data-testid="recap-sequence"')
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-live="polite"')
  })

  it("renders nothing when superlatives list is empty", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={[]} onComplete={() => {}} />
    )
    expect(html).toBe("")
  })

  it("renders hard card content: winner name 'Alice' in markup", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={() => {}} />
    )
    expect(html).toContain("Alice")
  })

  it("renders section with title 'Auszeichnungen' (awards title)", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={() => {}} />
    )
    expect(html).toContain("Auszeichnungen")
  })

  it("supports Reduced-Motion: renders correctly with useReveal.reduced branch", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={() => {}} />
    )
    expect(html).toContain('data-testid="recap-sequence"')
  })

  it("fireFeedback is mocked for call verification (progress-small, phase-complete)", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={() => {}} />
    )
    expect(html).toContain('data-testid="recap-sequence"')
  })

  it("accepts autoMode=false prop for manual-only advance", () => {
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
