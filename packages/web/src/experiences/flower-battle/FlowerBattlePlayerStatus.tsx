import { useTranslation } from "react-i18next"

import { TEAMS, type Team } from "@razzoozle/common/constants"
import type {
  FlowerBattleEffect,
  FlowerBattlePlayerStatus as FlowerBattlePlayerStatusData,
} from "@razzoozle/common/types/game/socket"
import { teamColor } from "@razzoozle/web/features/game/utils/teams"

import { FlowerPlant } from "./FlowerPlant"
import {
  clampGrowthStage,
  type TeamColorKey,
} from "./flower-plant.constants"

// WP-946-C2 — compact accessible mobile Flower player status.
// Preferred prop: wire `status` from @razzoozle/common/types/game/socket.
// Legacy flat props remain as a deprecated compatibility arm so Answers
// (and sibling consumers) still typecheck until C3 wires the store.

/**
 * Wire kind strings for persistent power-up status lines (snake_case).
 * Kept exported for FlowerPowerupStatusIcons / FlowerPowerupEffects which
 * still consume the string-literal form until a later wave.
 */
export type FlowerBattleActiveEffect = "umbrella_shield" | "acid_rain" | "sunbeam"

/**
 * Sun-point threshold shown in the header ("☀ {sunPoints}/3"). UI-level
 * display cap — backend tracks the accumulator without a named cap.
 */
const MAX_SUN_POINTS = 3

const KNOWN_EFFECT_KINDS = new Set<string>([
  "umbrella_shield",
  "acid_rain",
  "sunbeam",
])

/** @deprecated WP-946-C2 — flat props for pre-C3 call sites (Answers). */
export interface FlowerBattlePlayerStatusLegacyProps {
  /**
   * Experience mode wire value. Renders null unless `"flowerBattle"`.
   * @deprecated Use `status` once C3 wires the player store.
   */
  mode: string
  /** @deprecated */
  team: string
  /** @deprecated */
  teamName: string
  /** @deprecated */
  growthStage: number
  /** @deprecated */
  maxGrowthStage: number
  /** @deprecated */
  sunPoints: number
  /** @deprecated string kinds only — not full FlowerBattleEffect objects. */
  activeEffects: FlowerBattleActiveEffect[]
}

/** Preferred props — authoritative socket payload (WP-946-C2). */
export interface FlowerBattlePlayerStatusTypedProps {
  status: FlowerBattlePlayerStatusData
}

/**
 * Discriminated by presence of `status`. Preferred arm first; legacy arm is
 * a temporary compile-compatibility bridge until C3 removes it.
 */
export type FlowerBattlePlayerStatusProps =
  | FlowerBattlePlayerStatusTypedProps
  | FlowerBattlePlayerStatusLegacyProps

const isTeamColorKey = (value: string | null | undefined): value is TeamColorKey =>
  typeof value === "string" && (TEAMS as readonly string[]).includes(value)

const isLegacyProps = (
  props: FlowerBattlePlayerStatusProps,
): props is FlowerBattlePlayerStatusLegacyProps => !("status" in props)

const clampSunPoints = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_SUN_POINTS, Math.max(0, Math.floor(value)))
}

const clampMaxGrowth = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

/**
 * Normalize active effects to known kind strings only.
 * Accepts legacy string kinds and wire objects with `.kind`.
 * Does not invent missing object fields (remainingQuestions, etc.).
 */
const normalizeEffectKinds = (
  effects: ReadonlyArray<FlowerBattleActiveEffect | FlowerBattleEffect>,
): FlowerBattleActiveEffect[] => {
  const kinds: FlowerBattleActiveEffect[] = []
  for (const effect of effects) {
    const kind = typeof effect === "string" ? effect : effect.kind
    if (!KNOWN_EFFECT_KINDS.has(kind)) continue
    if (!kinds.includes(kind as FlowerBattleActiveEffect)) {
      kinds.push(kind as FlowerBattleActiveEffect)
    }
  }
  return kinds
}

const EFFECT_META: Record<
  FlowerBattleActiveEffect,
  { testId: string; i18nKey: string; defaultValue: string }
> = {
  umbrella_shield: {
    testId: "flower-battle-effect-umbrella-shield",
    i18nKey: "flowerBattlePlayerStatus.effect.umbrellaShield",
    defaultValue: "☂ Schutz aktiv",
  },
  acid_rain: {
    testId: "flower-battle-effect-acid-rain",
    i18nKey: "flowerBattlePlayerStatus.effect.acidRain",
    defaultValue: "☁ Nächstes Wachstum −1",
  },
  sunbeam: {
    testId: "flower-battle-effect-sunbeam",
    i18nKey: "flowerBattlePlayerStatus.effect.sunbeam",
    defaultValue: "☀ Nächstes Wachstum +1",
  },
}

type ResolvedView = {
  teamId: string | null
  teamName: string | null
  growthStage: number
  maxGrowthStage: number
  sunPoints: number
  effectKinds: FlowerBattleActiveEffect[]
}

const resolveFromStatus = (status: FlowerBattlePlayerStatusData): ResolvedView => {
  const teamId = status.teamId
  return {
    // Null team stays null — never invent a guessed team colour/name.
    teamId,
    teamName: teamId,
    growthStage: clampGrowthStage(status.growthStage),
    maxGrowthStage: clampMaxGrowth(status.maxGrowthStage),
    sunPoints: clampSunPoints(status.sunPoints),
    effectKinds: normalizeEffectKinds(status.activeEffects),
  }
}

const resolveFromLegacy = (props: FlowerBattlePlayerStatusLegacyProps): ResolvedView => ({
  teamId: props.team || null,
  teamName: props.teamName || props.team || null,
  growthStage: clampGrowthStage(props.growthStage),
  maxGrowthStage: clampMaxGrowth(props.maxGrowthStage),
  sunPoints: clampSunPoints(props.sunPoints),
  effectKinds: normalizeEffectKinds(props.activeEffects),
})

/**
 * FlowerBattlePlayerStatus — compact team/plant/growth/sun-points status for
 * the mobile player. role="status" + aria-live="polite". Semantic token classes
 * only. Renders FlowerPlant + one icon+text line per active effect kind.
 */
export function FlowerBattlePlayerStatus(props: FlowerBattlePlayerStatusProps) {
  const { t } = useTranslation("game")

  if (isLegacyProps(props) && props.mode !== "flowerBattle") {
    return null
  }

  const view = isLegacyProps(props)
    ? resolveFromLegacy(props)
    : resolveFromStatus(props.status)

  const plantTeam: Team | undefined = isTeamColorKey(view.teamId)
    ? view.teamId
    : undefined
  const colors = view.teamId ? teamColor(view.teamId) : { bg: "", text: "text-ink" }

  const header = view.teamName
    ? t("flowerBattlePlayerStatus.header", {
        defaultValue:
          "Team {{teamName}} · Blüte {{growthStage}}/{{maxGrowthStage}} · ☀ {{sunPoints}}/{{maxSunPoints}}",
        teamName: view.teamName,
        growthStage: view.growthStage,
        maxGrowthStage: view.maxGrowthStage,
        sunPoints: view.sunPoints,
        maxSunPoints: MAX_SUN_POINTS,
      })
    : t("flowerBattlePlayerStatus.headerNeutral", {
        defaultValue:
          "Blüte {{growthStage}}/{{maxGrowthStage}} · ☀ {{sunPoints}}/{{maxSunPoints}}",
        growthStage: view.growthStage,
        maxGrowthStage: view.maxGrowthStage,
        sunPoints: view.sunPoints,
        maxSunPoints: MAX_SUN_POINTS,
      })

  return (
    <div
      data-testid="flower-battle-player-status"
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2 ${colors.bg}`.trim()}
    >
      <div
        className="h-14 w-10 shrink-0"
        data-testid="flower-battle-player-status-plant"
      >
        <FlowerPlant
          growthStage={view.growthStage}
          variant="round"
          teamColor={plantTeam}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className={`text-sm font-semibold ${colors.text}`}>{header}</p>
        {view.effectKinds.map((kind) => {
          const meta = EFFECT_META[kind]
          return (
            <p
              key={kind}
              data-testid={meta.testId}
              data-effect-kind={kind}
              className="text-xs text-ink-subtle"
            >
              {t(meta.i18nKey, { defaultValue: meta.defaultValue })}
            </p>
          )
        })}
      </div>
    </div>
  )
}

export default FlowerBattlePlayerStatus
