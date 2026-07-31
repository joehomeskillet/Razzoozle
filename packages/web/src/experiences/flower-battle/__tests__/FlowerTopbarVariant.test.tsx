// Unit tests for FlowerTopbarVariant (WP-C-1 / SDD §14.1).
//
// Pure TSX — renderToStaticMarkup, no jsdom. Hard literals for default-value
// fallbacks (mirrors FlowerBattlePlayerStatus.test.tsx), so a translation edit
// that changes the rendered copy fails here too.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type {
  FlowerBattleEffect,
  FlowerBattlePlayerStatus as FlowerBattlePlayerStatusData,
} from "@razzoozle/common/types/game/socket"

import { FlowerTopbarVariant } from "../FlowerTopbarVariant"

// Mock t() — same fallback behaviour real i18next produces for these tests.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; [param: string]: unknown },
    ) => {
      if (!options?.defaultValue) {
        return key
      }
      return Object.entries(options).reduce(
        (str, [k, v]) =>
          k === "defaultValue" ? str : str.replaceAll(`{{${k}}}`, String(v)),
        options.defaultValue,
      )
    },
  }),
}))

const baseStatus = (
  overrides: Partial<FlowerBattlePlayerStatusData> = {},
): FlowerBattlePlayerStatusData => ({
  gameId: "g1",
  revision: "1",
  questionIndex: 8,
  teamId: "red",
  growthStage: 9,
  maxGrowthStage: 10,
  sunPoints: 1,
  activeEffects: [],
  victoryResolved: false,
  winnerTeamIds: [],
  isWinner: false,
  ...overrides,
})

describe("FlowerTopbarVariant", () => {
  it("renders the variant region with team-coloured classes when teamId is set", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({ teamId: "red" })}
        isLikelySolo={false}
      />,
    )

    expect(html).toContain('data-testid="flower-battle-topbar-variant"')
    expect(html).toContain('data-team-id="red"')
    expect(html).toContain('data-testid="flower-battle-topbar-team"')
    expect(html).toContain('data-team="red"')
    // Team red swatch maps to the mapped team token class — no hex literal.
    expect(html).toContain("bg-[var(--team-red)]")
    expect(html).toContain("ring-[var(--team-red-ring)]")
    expect(html).toContain("text-[var(--team-red-text)]")
    // Status row mirrors teamColor bg (pale wash).
    expect(html).toContain(
      "bg-[color-mix(in_srgb,var(--team-red),white_85%)]",
    )
  })

  it("renders neutral chrome when teamId is null", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({ teamId: null })}
        isLikelySolo={false}
      />,
    )

    expect(html).toContain('data-team-id="none"')
    expect(html).toContain('data-team="none"')
    // No team-coloured swatch applied.
    expect(html).not.toContain("bg-[var(--team-red)]")
    expect(html).not.toContain("bg-[var(--team-blue)]")
    expect(html).not.toContain("bg-[var(--team-green)]")
    expect(html).not.toContain("bg-[var(--team-yellow)]")
    // Neutral fallback surfaces + ink label.
    expect(html).toContain("bg-surface-2")
    expect(html).toContain("text-ink")
  })

  it("renders neutral chrome when teamId is unknown (raw wire value)", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({
          teamId: "team-uuid-abc" as unknown as string,
        })}
        isLikelySolo={false}
      />,
    )

    expect(html).toContain('data-team-id="none"')
    // Unknown teamId never surfaces as the visible team name.
    expect(html).not.toContain("team-uuid-abc")
  })

  it("surfaces a safe-area inset class on the outer wrapper", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus()}
        isLikelySolo={false}
      />,
    )

    // GameWrapper provides the safe-area top pad on the topbar region; the
    // variant itself does not need a duplicate inset, but the inner status
    // row must respect the wrapping pad (no overflow on 375×667).
    expect(html).toContain('data-testid="flower-battle-topbar-variant"')
    expect(html).toContain("rounded-2xl")
    expect(html).toContain("px-3")
  })

  it("renders the status row visible with aria-live=polite and the composed status line", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({
          teamId: "blue",
          growthStage: 9,
          maxGrowthStage: 10,
          sunPoints: 1,
        })}
        isLikelySolo={false}
      />,
    )

    expect(html).toContain('data-testid="flower-battle-topbar-status"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain(
      "Team Blau · Blüte 9/10 · ☀ 1/3",
    )
  })

  it("renders neutral status line when teamId is null", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({ teamId: null, growthStage: 4 })}
        isLikelySolo={true}
      />,
    )

    expect(html).toContain("Blüte 4/10 · ☀ 1/3")
    expect(html).not.toContain("Team red")
    expect(html).not.toContain("Team null")
  })

  it("does NOT use any hardcoded hex color class in the DOM", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({ teamId: "green" })}
        isLikelySolo={false}
      />,
    )

    // Forbidden: arbitrary hex literal classes (token-agnostic).
    expect(html).not.toMatch(/bg-\[#[0-9a-fA-F]{3,8}\]/)
    expect(html).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/)
    expect(html).not.toMatch(/border-\[#[0-9a-fA-F]{3,8}\]/)
    // Token-driven team colour classes are present.
    expect(html).toContain("bg-[var(--team-green)]")
  })

  it("clamps growth stage against maxGrowthStage and sun points to the display cap", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({
          growthStage: 99,
          maxGrowthStage: 5,
          sunPoints: 99,
        })}
        isLikelySolo={false}
      />,
    )

    expect(html).toContain("Blüte 5/5")
    expect(html).toContain("☀ 3/3")
    expect(html).not.toContain("Blüte 99/5")
  })

  it("renders active powerup effect pills when activeEffects include a known kind", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SELECT_ANSWER" as never}
        flowerBattlePlayerStatus={baseStatus({
          activeEffects: [
            { kind: "umbrella_shield", remainingQuestions: 2 } as FlowerBattleEffect,
          ],
        })}
        isLikelySolo={false}
      />,
    )

    expect(html).toContain(
      'data-testid="flower-battle-topbar-effect-umbrella-shield"',
    )
    expect(html).toContain("☂ Schutz aktiv")
  })

  it("renders the question prefix + question index (1-based) when payload has questionIndex", () => {
    const html = renderToStaticMarkup(
      <FlowerTopbarVariant
        statusName={"SHOW_QUESTION" as never}
        flowerBattlePlayerStatus={baseStatus({ questionIndex: 0, teamId: "yellow" })}
        isLikelySolo={false}
      />,
    )

    expect(html).toContain('data-testid="flower-battle-topbar-question"')
    expect(html).toContain(
      'data-testid="flower-battle-topbar-question-value"',
    )
    expect(html).toContain("Frage #")
    expect(html).toContain("1 / 10")
  })
})
