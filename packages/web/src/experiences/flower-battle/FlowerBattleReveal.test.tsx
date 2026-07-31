import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { FlowerBattlePlayerStatus } from "@razzoozle/common/types/game/socket"

import { FlowerBattleReveal } from "./FlowerBattleReveal"

// Strip motion/react down to its SSR-safe surface: the `motion.*` proxy and a
// reduced-motion flag. `useMotionValue` is required by FlowerPlant (transitive
// dep), so we provide a no-op that returns the initial value.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (options?.defaultValue) return options.defaultValue
      return key
    },
  }),
}))

vi.mock("motion/react", async () => {
  const React = await import("react")
  return {
    motion: new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          return React.forwardRef<HTMLElement, object>((props, ref) =>
            React.createElement(prop, { ...props, ref }),
          )
        },
      },
    ),
    useReducedMotion: () => true,
    useMotionValue: <T,>(value: T) => ({ get: () => value, set: () => {} }),
    animate: () => ({ stop: () => {} }),
  }
})

vi.mock("@razzoozle/web/features/game/utils/teams", () => ({
  teamColor: (team: string) =>
    team === "blue"
      ? { bg: "bg-team-blue", text: "text-team-blue-text" }
      : { bg: "", text: "text-ink" },
}))

const baseStatus: FlowerBattlePlayerStatus = {
  gameId: "game-test",
  revision: "1",
  questionIndex: 1,
  teamId: "blue",
  growthStage: 3,
  maxGrowthStage: 10,
  sunPoints: 1,
  activeEffects: [],
  victoryResolved: false,
  winnerTeamIds: [],
  isWinner: false,
}

describe("FlowerBattleReveal (Player Client comic reaction)", () => {
  it("renders 'correct' with check sticker, head line Richtig, and progress card", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleReveal
        kind="correct"
        status={baseStatus}
        previousStatus={{ ...baseStatus, growthStage: 1 }}
      />,
    )
    expect(html).toContain('data-testid="flower-battle-reveal"')
    expect(html).toContain('data-kind="correct"')
    expect(html).toContain('data-testid="flower-battle-reveal-check-sticker"')
    expect(html).toContain("Richtig")
    expect(html).toContain("Deine Blüte wächst!")
    expect(html).toContain('data-testid="flower-battle-reveal-progress"')
    expect(html).toContain('data-testid="flower-battle-reveal-growth-delta"')
  })

  it("renders 'incorrect' with X sticker and the 'Richtige Antwort' card", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleReveal
        kind="incorrect"
        status={baseStatus}
        correctAnswer="42"
      />,
    )
    expect(html).toContain('data-kind="incorrect"')
    expect(html).toContain('data-testid="flower-battle-reveal-x-sticker"')
    expect(html).toContain("Schade")
    expect(html).toContain('data-testid="flower-battle-reveal-correct-answer-card"')
    expect(html).toContain("42")
  })

  it("renders special states (timeout, multipleCorrect, reconnect) with neutral sticker", () => {
    const kinds = [
      "timeout",
      "noAnswer",
      "partial",
      "serverCorrected",
      "reconnect",
      "multipleCorrect",
    ] as const
    for (const kind of kinds) {
      const html = renderToStaticMarkup(
        <FlowerBattleReveal kind={kind} status={baseStatus} />,
      )
      expect(html, `kind=${kind}`).toContain(`data-kind="${kind}"`)
      expect(html, `kind=${kind}`).toContain(
        'data-testid="flower-battle-reveal-neutral-sticker"',
      )
    }
  })

  it("does NOT render the comic stickers in the special-state branch when kind is missing", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleReveal kind="correct" status={baseStatus} />,
    )
    expect(html).not.toContain('data-testid="flower-battle-reveal-x-sticker"')
    expect(html).not.toContain('data-testid="flower-battle-reveal-neutral-sticker"')
  })

  it("respects an explicit headline override", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleReveal
        kind="correct"
        status={baseStatus}
        headline="Boom!"
        subline="Custom line"
      />,
    )
    expect(html).toContain("Boom!")
    expect(html).toContain("Custom line")
  })

  it("never fills with the full-bleed state-correct background (§16 prohibition)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleReveal kind="correct" status={baseStatus} />,
    )
    // The reveal must not slap the legacy `bg-[var(--state-correct)]` full-bleed
    // surface that the previous Result.tsx variant used.
    expect(html).not.toContain("bg-[var(--state-correct)]")
    expect(html).not.toContain("correct-answer-highlight")
  })
})
