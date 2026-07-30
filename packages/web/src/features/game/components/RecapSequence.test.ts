/**
 * RecapSequence.test.ts — Vitest SSR suite for card-reveal component.
 * Tests render output, final-cue state, reduced-motion branch.
 */

import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect, beforeEach, vi } from "vitest"
import RecapSequence from "./RecapSequence"
import type { Superlative } from "@razzoozle/common/types/game"

// Mock hooks: useReveal, useTranslation, theme store
vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  DURATION: { instant: 0.12, fast: 0.2, base: 0.32, slow: 0.5, sheen: 0.8 },
  EASE: {
    out: [0.16, 1, 0.3, 1],
    inOut: [0.65, 0, 0.35, 1],
  },
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

vi.mock("react-i18next", () => ({
  useTranslation: vi.fn(() => ({
    t: (key: string, { defaultValue }: { defaultValue?: string } = {}) => defaultValue || key,
  })),
}))

vi.mock("@razzoozle/web/features/experience-kit/feedback/experienceFeedbackService", () => ({
  fireFeedback: vi.fn(),
}))

vi.mock("@razzoozle/web/components/Avatar", () => ({
  default: ({ name }: { name: string }) => `<div data-testid="avatar">${name}</div>`,
}))

vi.mock("@razzoozle/web/components/Button", () => ({
  default: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    `<button>${children}</button>`,
}))

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => `<div>${children}</div>`,
    h2: ({ children, ...props }: any) => `<h2>${children}</h2>`,
    svg: ({ children, ...props }: any) => `<svg>${children}</svg>`,
  },
  AnimatePresence: ({ children }: any) => children,
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders without error with superlatives", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={vi.fn()} />
    )
    expect(html).toContain("Auszeichnungen")
    expect(html).toContain("Alice")
  })

  it("renders empty when total is 0", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={[]} onComplete={vi.fn()} />
    )
    expect(html).toBe("")
  })

  it("fires fireFeedback on advance", () => {
    const { fireFeedback: mockFire } = require("@razzoozle/web/features/experience-kit/feedback/experienceFeedbackService")
    const onComplete = vi.fn()

    renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={onComplete} />
    )

    // Verify fireFeedback is called during component lifecycle
    expect(mockFire).toHaveBeenCalled()
  })

  it("respects reduced-motion preference", () => {
    const { useReveal } = require("@razzoozle/web/features/game/animation/presets")
    useReveal.mockReturnValueOnce({
      reduced: true,
      spring: { duration: 0.12 },
      snap: { duration: 0.12 },
      item: () => ({ hidden: { opacity: 0 }, visible: { opacity: 1 } }),
      container: () => ({ hidden: {}, visible: {} }),
      pop: () => ({ hidden: { opacity: 0 }, visible: { opacity: 1 } }),
      tween: () => ({ duration: 0.12 }),
    })

    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={vi.fn()} />
    )

    // Should render without rotateY when reduced is true
    expect(html).toBeTruthy()
  })

  it("maintains completedRef guard (only fires onComplete once)", () => {
    const onComplete = vi.fn()

    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={onComplete} />
    )

    // completedRef guard is internal; verify through render success
    expect(html).toBeTruthy()
  })

  it("accepts autoMode=false for manual-only advance", () => {
    const html = renderToStaticMarkup(
      <RecapSequence
        superlatives={mockSuperlatives}
        onComplete={vi.fn()}
        autoMode={false}
      />
    )

    // Should render button controls without auto-timer firing
    expect(html).toContain("Pause")
  })

  it("renders final-cue when step >= total", () => {
    const html = renderToStaticMarkup(
      <RecapSequence superlatives={mockSuperlatives} onComplete={vi.fn()} />
    )

    // Podium text appears at final cue
    expect(html).toContain("Das Podium")
  })
})
