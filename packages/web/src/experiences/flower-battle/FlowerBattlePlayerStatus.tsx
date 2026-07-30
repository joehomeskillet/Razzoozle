import { useTranslation } from "react-i18next"
import { teamColor } from "@razzoozle/web/features/game/utils/teams"

// WP940 (WP-FLB-15) — player-facing compact status header for the
// flower_battle experience mode. Renders on the player's own device during
// SelectAnswer/ShowQuestion; NEVER touches question/answer content — the
// props below are exhaustively the battle-status data this component needs.

/**
 * Wire values of `FlowerBattleEffect` (rust/protocol/src/experience.rs,
 * `#[serde(rename_all = "snake_case")]`). Kept as a local literal union
 * rather than importing rust/protocol/bindings/FlowerBattleEffect.ts — this
 * package has no established import path for that bindings directory (see
 * packages/common/src/types/game/* for the repo's actual pattern: hand-
 * mirrored TS types, not direct bindings imports).
 */
export type FlowerBattleActiveEffect = "umbrella_shield" | "acid_rain" | "sunbeam"

/**
 * Sun-point threshold shown in the header ("☀ {sunPoints}/3"). No backend
 * constant exists for this yet (WP930 only tracks the accumulator, not a
 * cap) — named here as the single source for this UI-level constant instead
 * of a repeated magic number.
 */
const MAX_SUN_POINTS = 3

export interface FlowerBattlePlayerStatusProps {
  /**
   * Current experience mode, the ExperienceMode wire value (camelCase, e.g.
   * from a future `game:experience` player-facing read — see the pending
   * gating skeleton in Answers.tsx). Renders null for anything other than
   * `"flowerBattle"`.
   */
  mode: string
  /** Team id for color lookup (teams.ts convention — red/blue/green/yellow). */
  team: string
  /** Display name for the header (may equal `team` or a custom label). */
  teamName: string
  /**
   * Contract gap (documented, not worked around with a fake value): WP927/
   * WP930 shipped `FlowerBattleTeamState.sunPoints` but no growth-stage
   * field at all. This component's own prop signature (growthStage/
   * maxGrowthStage) is the interface the eventual data source must satisfy
   * — it is NOT derived from any existing wire field today.
   */
  growthStage: number
  maxGrowthStage: number
  sunPoints: number
  activeEffects: FlowerBattleActiveEffect[]
}

/**
 * FlowerBattlePlayerStatus — compact team/growth/sun-points header + at most
 * one status line per active effect (icon + visible text label together,
 * never icon-only). No status line at all when no effect is active.
 */
export function FlowerBattlePlayerStatus({
  mode,
  team,
  teamName,
  growthStage,
  maxGrowthStage,
  sunPoints,
  activeEffects,
}: FlowerBattlePlayerStatusProps) {
  const { t } = useTranslation("game")

  if (mode !== "flowerBattle") {
    return null
  }

  const safeGrowth = Number.isFinite(growthStage) ? Math.max(0, Math.floor(growthStage)) : 0
  const safeMaxGrowth = Number.isFinite(maxGrowthStage)
    ? Math.max(0, Math.floor(maxGrowthStage))
    : 0
  const safeSunPoints = Number.isFinite(sunPoints)
    ? Math.min(MAX_SUN_POINTS, Math.max(0, Math.floor(sunPoints)))
    : 0
  const colors = teamColor(team)

  return (
    <div
      data-testid="flower-battle-player-status"
      className={`flex flex-col gap-1 rounded-2xl border border-line bg-surface-2 px-4 py-2 ${colors.bg}`}
    >
      <p className={`text-sm font-semibold ${colors.text}`}>
        {t("flowerBattlePlayerStatus.header", {
          defaultValue:
            "Team {{teamName}} · Blüte {{growthStage}}/{{maxGrowthStage}} · ☀ {{sunPoints}}/{{maxSunPoints}}",
          teamName,
          growthStage: safeGrowth,
          maxGrowthStage: safeMaxGrowth,
          sunPoints: safeSunPoints,
          maxSunPoints: MAX_SUN_POINTS,
        })}
      </p>
      {activeEffects.includes("umbrella_shield") && (
        <p
          data-testid="flower-battle-effect-umbrella-shield"
          className="text-xs text-ink-subtle"
        >
          {t("flowerBattlePlayerStatus.effect.umbrellaShield", {
            defaultValue: "☂ Schutz aktiv",
          })}
        </p>
      )}
      {activeEffects.includes("acid_rain") && (
        <p data-testid="flower-battle-effect-acid-rain" className="text-xs text-ink-subtle">
          {t("flowerBattlePlayerStatus.effect.acidRain", {
            defaultValue: "☁ Nächstes Wachstum −1",
          })}
        </p>
      )}
      {activeEffects.includes("sunbeam") && (
        <p data-testid="flower-battle-effect-sunbeam" className="text-xs text-ink-subtle">
          {t("flowerBattlePlayerStatus.effect.sunbeam", {
            defaultValue: "☀ Nächstes Wachstum +1",
          })}
        </p>
      )}
    </div>
  )
}

export default FlowerBattlePlayerStatus
