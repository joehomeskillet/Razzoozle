// Unit tests for FlowerBattlePlayerStatus (WP-946-C2 / #979).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only. Hard
// literals throughout (matches the header/effect-line copy exactly) rather
// than asserting on i18n key names, so a translation edit that changes the
// actual rendered copy is caught here too.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { FlowerBattlePlayerStatus as FlowerBattlePlayerStatusData } from "@razzoozle/common/types/game/socket"

import {
  FlowerBattlePlayerStatus,
  type FlowerBattleActiveEffect,
  type FlowerBattlePlayerStatusLegacyProps,
} from "./FlowerBattlePlayerStatus"

// Mock t() to return the defaultValue with {{placeholder}} interpolation —
// same behaviour real i18next would produce for these hard-literal assertions.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: { defaultValue?: string; [param: string]: unknown },
    ) => {
      if (!options?.defaultValue) {
        return _key
      }
      return Object.entries(options).reduce(
        (str, [k, v]) =>
          k === "defaultValue" ? str : str.replaceAll(`{{${k}}}`, String(v)),
        options.defaultValue,
      )
    },
  }),
}))

// FlowerPlant pulls motion/react — static markup mock (same shape as FlowerPlant.test).
vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
  useMotionValue: (initial: number) => {
    let current = initial
    return {
      get: () => current,
      set: (value: number) => {
        current = value
      },
    }
  },
  animate: vi.fn(() => Promise.resolve()),
  motion: {
    g: ({
      children,
      id,
      ...rest
    }: {
      children?: React.ReactNode
      id?: string
      [key: string]: unknown
    }) => (
      <g id={id} {...rest}>
        {children}
      </g>
    ),
  },
}))

const baseLegacy: FlowerBattlePlayerStatusLegacyProps = {
  mode: "flowerBattle",
  team: "red",
  teamName: "Rot",
  growthStage: 4,
  maxGrowthStage: 10,
  sunPoints: 2,
  activeEffects: [] as FlowerBattleActiveEffect[],
}

const baseStatus = (
  overrides: Partial<FlowerBattlePlayerStatusData> = {},
): FlowerBattlePlayerStatusData => ({
  gameId: "g1",
  questionIndex: 0,
  teamId: "red",
  growthStage: 4,
  maxGrowthStage: 10,
  sunPoints: 2,
  activeEffects: [],
  victoryResolved: false,
  winnerTeamIds: [],
  isWinner: false,
  ...overrides,
})

describe("FlowerBattlePlayerStatus", () => {
  describe("legacy props (deprecated compatibility)", () => {
    it("composes the header with team, growth stage, and sun points", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus {...baseLegacy} />,
      )
      expect(html).toContain("Team Rot · Blüte 4/10 · ☀ 2/3")
    })

    it("renders the umbrella_shield status line with icon + text label", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          {...baseLegacy}
          activeEffects={["umbrella_shield"]}
        />,
      )
      expect(html).toContain("☂ Schutz aktiv")
      expect(html).toContain(
        'data-testid="flower-battle-effect-umbrella-shield"',
      )
    })

    it("renders the acid_rain status line with icon + text label", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          {...baseLegacy}
          activeEffects={["acid_rain"]}
        />,
      )
      expect(html).toContain("☁ Nächstes Wachstum −1")
      expect(html).toContain('data-testid="flower-battle-effect-acid-rain"')
    })

    it("renders the sunbeam status line with icon + text label", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          {...baseLegacy}
          activeEffects={["sunbeam"]}
        />,
      )
      expect(html).toContain("☀ Nächstes Wachstum +1")
      expect(html).toContain('data-testid="flower-battle-effect-sunbeam"')
    })

    it("renders no status line when no effect is active", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus {...baseLegacy} />,
      )
      expect(html).not.toContain("flower-battle-effect-")
      expect(html).not.toContain("Schutz aktiv")
      expect(html).not.toContain("Wachstum")
    })

    it("renders multiple simultaneously active effect lines", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          {...baseLegacy}
          activeEffects={["umbrella_shield", "sunbeam"]}
        />,
      )
      expect(html).toContain("☂ Schutz aktiv")
      expect(html).toContain("☀ Nächstes Wachstum +1")
      expect(html).not.toContain("Nächstes Wachstum −1")
    })

    it("renders null for a foreign experience mode", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus {...baseLegacy} mode="pyramidClimb" />,
      )
      expect(html).toBe("")
    })

    it("renders null for classic (no experience mode)", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus {...baseLegacy} mode="classic" />,
      )
      expect(html).toBe("")
    })

    it("clamps sun points display at the max threshold", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus {...baseLegacy} sunPoints={99} />,
      )
      expect(html).toContain("☀ 3/3")
    })

    it("legacy compile/render compatibility — Answers-shaped call still mounts", () => {
      // Mirrors packages/web/.../Answers.tsx call site (flat props).
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          mode="flowerBattle"
          team="blue"
          teamName="Blau"
          growthStage={1}
          maxGrowthStage={10}
          sunPoints={0}
          activeEffects={[]}
        />,
      )
      expect(html).toContain('data-testid="flower-battle-player-status"')
      expect(html).toContain("Team Blau · Blüte 1/10 · ☀ 0/3")
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-live="polite"')
    })
  })

  describe("typed status prop (preferred)", () => {
    it("renders human team label (not raw teamId), growth/max, and sun points", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({ teamId: "green", growthStage: 5, sunPoints: 1 })}
        />,
      )
      // WP-946-C3: never surface raw wire id "green" as the human team name.
      expect(html).toContain("Team Grün · Blüte 5/10 · ☀ 1/3")
      expect(html).not.toContain("Team green")
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-live="polite"')
    })

    it("renders FlowerPlant at the clamped growth stage", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus status={baseStatus({ growthStage: 7 })} />,
      )
      expect(html).toContain('data-testid="flower-battle-player-status-plant"')
      expect(html).toContain('data-testid="flower-plant-stage-7"')
      expect(html).toContain('data-growth-stage="7"')
    })

    it("typed object effects — uses effect.kind for icon+text lines", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            activeEffects: [
              { kind: "umbrella_shield", remainingQuestions: 2 },
              { kind: "sunbeam", expiresAfterQuestionId: 4 },
            ],
          })}
        />,
      )
      expect(html).toContain("☂ Schutz aktiv")
      expect(html).toContain("☀ Nächstes Wachstum +1")
      expect(html).toContain('data-effect-kind="umbrella_shield"')
      expect(html).toContain('data-effect-kind="sunbeam"')
      expect(html).toContain(
        'data-testid="flower-battle-effect-umbrella-shield"',
      )
      expect(html).toContain('data-testid="flower-battle-effect-sunbeam"')
      // Must not invent/serialize extra effect fields into the DOM.
      expect(html).not.toContain("remainingQuestions")
      expect(html).not.toContain("expiresAfterQuestionId")
    })

    it("renders multiple typed object effects including acid_rain", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            activeEffects: [
              {
                kind: "acid_rain",
                sourceTeamId: "blue",
                expiresAfterQuestionId: 3,
              },
              { kind: "umbrella_shield", remainingQuestions: 1 },
              { kind: "sunbeam", expiresAfterQuestionId: 3 },
            ],
          })}
        />,
      )
      expect(html).toContain("☁ Nächstes Wachstum −1")
      expect(html).toContain("☂ Schutz aktiv")
      expect(html).toContain("☀ Nächstes Wachstum +1")
      expect(html).toContain('data-effect-kind="acid_rain"')
    })

    it("null team → neutral label, no guessed team name", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus status={baseStatus({ teamId: null })} />,
      )
      expect(html).toContain("Blüte 4/10 · ☀ 2/3")
      expect(html).not.toContain("Team red")
      expect(html).not.toContain("Team null")
      // Neutral plant (no forced team colour attribute on a guessed team).
      expect(html).toContain('data-testid="flower-plant-stage-4"')
    })

    it("numeric clamp — growthStage and sunPoints", () => {
      const high = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            growthStage: 99,
            sunPoints: 50,
            maxGrowthStage: 10,
          })}
        />,
      )
      expect(high).toContain("Blüte 10/10")
      expect(high).toContain("☀ 3/3")
      expect(high).toContain('data-testid="flower-plant-stage-10"')

      const low = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            growthStage: -4,
            sunPoints: -1,
            maxGrowthStage: 10,
          })}
        />,
      )
      expect(low).toContain("Blüte 0/10")
      expect(low).toContain("☀ 0/3")
      expect(low).toContain('data-testid="flower-plant-stage-0"')
    })

    it("clamps growthStage against maxGrowthStage (not only global stage max)", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            growthStage: 99,
            maxGrowthStage: 5,
            sunPoints: 0,
          })}
        />,
      )
      expect(html).toContain("Blüte 5/5")
      expect(html).toContain('data-testid="flower-plant-stage-5"')
      expect(html).not.toContain("Blüte 10/5")
      expect(html).not.toContain("Blüte 99/5")
    })

    it("unknown teamId stays neutral — never prints the raw id as a team name", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({ teamId: "team-uuid-abc" as unknown as string })}
        />,
      )
      expect(html).toContain("Blüte 4/10 · ☀ 2/3")
      expect(html).not.toContain("Team team-uuid-abc")
      expect(html).not.toContain("team-uuid-abc")
    })

    // #982 / wp-b813aed8d3fc: maxGrowthStage is a display bound too — clamp it
    // strictly into the plant's 0..10 stage range before composing the header.
    it("clamps maxGrowthStage strictly into 0..10", () => {
      const overMax = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            growthStage: 4,
            maxGrowthStage: 99,
            sunPoints: 0,
          })}
        />,
      )
      expect(overMax).toContain("Blüte 4/10")
      expect(overMax).not.toContain("/99")

      const overBoth = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            growthStage: 99,
            maxGrowthStage: 99,
            sunPoints: 0,
          })}
        />,
      )
      expect(overBoth).toContain("Blüte 10/10")
      expect(overBoth).toContain('data-testid="flower-plant-stage-10"')

      const negative = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({
            growthStage: 4,
            maxGrowthStage: -3,
            sunPoints: 0,
          })}
        />,
      )
      expect(negative).toContain("Blüte 0/0")
      expect(negative).toContain('data-testid="flower-plant-stage-0"')
    })

    // #982 / wp-b813aed8d3fc: teamColor() is only defined for known colour
    // keys. An unknown team id must stay semantically neutral (surface + ink),
    // never the raw gray fallback classes from the teamColor fallback arm.
    it("unknown team is semantically neutral — no gray fallback classes", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus
          status={baseStatus({ teamId: "team-uuid-abc" as unknown as string })}
        />,
      )
      expect(html).toContain("text-ink")
      expect(html).not.toContain("bg-gray-100")
      expect(html).not.toContain("text-gray-800")
      expect(html).not.toContain("bg-gray-400")
    })

    it("known team keeps the team colour token classes", () => {
      const html = renderToStaticMarkup(
        <FlowerBattlePlayerStatus status={baseStatus({ teamId: "red" })} />,
      )
      expect(html).toContain(
        "bg-[color-mix(in_srgb,var(--team-red),white_85%)]",
      )
      expect(html).toContain("text-[var(--team-red-text)]")
    })
  })
})
