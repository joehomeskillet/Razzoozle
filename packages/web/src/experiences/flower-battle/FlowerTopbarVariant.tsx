import { TEAMS, type Team } from "@razzoozle/common/constants"
import type { Status } from "@razzoozle/common/types/game/status"
import type {
  FlowerBattleEffect,
  FlowerBattlePlayerStatus as FlowerBattlePlayerStatusData,
} from "@razzoozle/common/types/game/socket"
import AvToggles from "@razzoozle/web/features/game/components/GameWrapper/AvToggles"
import { teamColor, teamSwatch } from "@razzoozle/web/features/game/utils/teams"
import { useTranslation } from "react-i18next"

import {
  clampGrowthStage,
  GROWTH_STAGE_MAX,
  GROWTH_STAGE_MIN,
  type TeamColorKey,
} from "./flower-plant.constants"

// WP-C-1 / SDD §14.1 — team-coloured comic-style replacement for the standard
// player topbar during Flower Battle gameplay.
//
// Target layout (SDD §14.1):
//   [ Frage n/m ] [ Blütenicon · Team Rot ] [ Audio ] [ Haptik ] · [ Blüte n/m · Sonne n/3 ]
//
// Two-line grid so the avatar / AV toggles row never wraps the status row off
// screen on 375×667 (the smallest test viewport).
//
// All colors flow via the mapped team tokens (`teamColor` / `teamSwatch`) or
// existing surface/ink tokens — no hex literals, no unmapped arbitrary
// classes.

export interface FlowerTopbarVariantProps {
  statusName: Status | undefined
  flowerBattlePlayerStatus?: FlowerBattlePlayerStatusData | null
  isLikelySolo: boolean
}

const isTeamColorKey = (
  value: string | null | undefined,
): value is TeamColorKey =>
  typeof value === "string" && (TEAMS as readonly string[]).includes(value)

/** Display cap mirrors FlowerBattlePlayerStatus.MAX_SUN_POINTS (UI-only). */
const MAX_SUN_POINTS = 3

const TEAM_LABEL_DEFAULTS: Record<TeamColorKey, string> = {
  red: "Rot",
  blue: "Blau",
  green: "Grün",
  yellow: "Gelb",
}

const KNOWN_EFFECT_KINDS = new Set<string>([
  "umbrella_shield",
  "acid_rain",
  "sunbeam",
])

type FlowerBattleActiveEffect =
  "umbrella_shield" | "acid_rain" | "sunbeam"

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
  { testId: string; defaultValue: string }
> = {
  umbrella_shield: {
    testId: "flower-battle-topbar-effect-umbrella-shield",
    defaultValue: "☂ Schutz aktiv",
  },
  acid_rain: {
    testId: "flower-battle-topbar-effect-acid-rain",
    defaultValue: "☁ Nächstes Wachstum −1",
  },
  sunbeam: {
    testId: "flower-battle-topbar-effect-sunbeam",
    defaultValue: "☀ Nächstes Wachstum +1",
  },
}

const clampSunPoints = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_SUN_POINTS, Math.max(0, Math.floor(value)))
}

const clampMaxGrowth = (value: number): number => {
  if (!Number.isFinite(value)) return GROWTH_STAGE_MIN
  return Math.min(
    GROWTH_STAGE_MAX,
    Math.max(GROWTH_STAGE_MIN, Math.floor(value)),
  )
}

const clampGrowthAgainstMax = (
  growthStage: number,
  maxGrowthStage: number,
): { growthStage: number; maxGrowthStage: number } => {
  const max = clampMaxGrowth(maxGrowthStage)
  return {
    maxGrowthStage: max,
    growthStage: Math.min(clampGrowthStage(growthStage), max),
  }
}

type ResolvedView = {
  teamId: Team | null
  growthStage: number
  maxGrowthStage: number
  sunPoints: number
  effectKinds: FlowerBattleActiveEffect[]
}

const resolveView = (
  status: FlowerBattlePlayerStatusData | null | undefined,
): ResolvedView => {
  if (!status) {
    return {
      teamId: null,
      growthStage: GROWTH_STAGE_MIN,
      maxGrowthStage: GROWTH_STAGE_MAX,
      sunPoints: 0,
      effectKinds: [],
    }
  }
  const teamId = isTeamColorKey(status.teamId) ? status.teamId : null
  const growth = clampGrowthAgainstMax(
    status.growthStage,
    status.maxGrowthStage,
  )
  return {
    teamId,
    growthStage: growth.growthStage,
    maxGrowthStage: growth.maxGrowthStage,
    sunPoints: clampSunPoints(status.sunPoints),
    effectKinds: normalizeEffectKinds(status.activeEffects),
  }
}

/**
 * FlowerTopbarVariant — team-coloured comic-style replacement for the standard
 * player topbar in Flower Battle gameplay. Renders the persistent topbar
 * region (question prefix + team badge + AV toggles) AND the compact status
 * line, then NEVER duplicates the `FlowerBattlePlayerStatus` HUD (which
 * remains in the content slot below).
 *
 * Safe-area aware, two-line grid, aria-live="polite" on the status row.
 */
export function FlowerTopbarVariant({
  statusName,
  flowerBattlePlayerStatus,
  isLikelySolo,
}: FlowerTopbarVariantProps) {
  const { t } = useTranslation("game")
  const view = resolveView(flowerBattlePlayerStatus)

  // Question index pulled from the wire envelope (server-issued questionIndex).
  // Fallback to status-driven label when payload not yet present.
  const questionIndex =
    flowerBattlePlayerStatus?.questionIndex != null
      ? Math.max(0, Math.floor(flowerBattlePlayerStatus.questionIndex))
      : null
  const totalQuestions = view.maxGrowthStage

  const swatch = view.teamId ? teamSwatch(view.teamId) : null
  const colors = view.teamId ? teamColor(view.teamId) : { bg: "", text: "text-ink" }

  const displayTeamName = view.teamId
    ? t(`teams.${view.teamId}`, {
        defaultValue: TEAM_LABEL_DEFAULTS[view.teamId],
      })
    : null

  const statusLine = displayTeamName
    ? t("flowerBattleTopbar.statusLine", {
        defaultValue:
          "Team {{teamName}} · Blüte {{growthStage}}/{{maxGrowthStage}} · ☀ {{sunPoints}}/{{maxSunPoints}}",
        teamName: displayTeamName,
        growthStage: view.growthStage,
        maxGrowthStage: view.maxGrowthStage,
        sunPoints: view.sunPoints,
        maxSunPoints: MAX_SUN_POINTS,
      })
    : t("flowerBattleTopbar.statusLineNeutral", {
        defaultValue:
          "Blüte {{growthStage}}/{{maxGrowthStage}} · ☀ {{sunPoints}}/{{maxSunPoints}}",
        growthStage: view.growthStage,
        maxGrowthStage: view.maxGrowthStage,
        sunPoints: view.sunPoints,
        maxSunPoints: MAX_SUN_POINTS,
      })

  const questionLabel =
    questionIndex != null
      ? `${questionIndex + 1} / ${totalQuestions}`
      : null

  return (
    <div
      data-testid="flower-battle-topbar-variant"
      data-status-name={statusName ?? ""}
      data-team-id={view.teamId ?? "none"}
      data-solo={isLikelySolo ? "true" : "false"}
      role="region"
      aria-label={t("flowerBattleTopbar.regionLabel", {
        defaultValue: "Blüten-Battle Spielstatus",
      })}
      className="border-line bg-surface flex w-full flex-col gap-2 rounded-2xl border px-3 py-2 shadow-[var(--shadow-flat)]"
    >
      <div className="flex w-full items-center justify-between gap-2">
        {/* Question prefix — mirrors the standard topbar slot so a user
            recognises it instantly as the question progress pill. */}
        <div
          className="text-ink flex shrink-0 items-center gap-1 text-sm font-semibold"
          data-testid="flower-battle-topbar-question"
        >
          <span>{t("game:questionPrefix", { defaultValue: "Frage #" })}</span>
          {questionLabel && (
            <span data-testid="flower-battle-topbar-question-value">
              {questionLabel}
            </span>
          )}
        </div>

        {/* Team badge — coloured swatch (solid base fill + derived ink label)
            so the team identity is unmistakable on the cream field. */}
        <div
          data-testid="flower-battle-topbar-team"
          data-team={view.teamId ?? "none"}
          className={`flex min-w-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            swatch
              ? `${swatch.bg} ${swatch.ring} ${swatch.label}`
              : "border-line bg-surface-2 text-ink"
          }`}
        >
          <span aria-hidden className="text-base leading-none">
            ✿
          </span>
          <span className="truncate">
            {displayTeamName ??
              t("flowerBattleTopbar.noTeam", {
                defaultValue: "Kein Team",
              })}
          </span>
        </div>

        {/* AV toggles — exact same surface buttons as the standard topbar
            (Sound + Haptics), kept so players can silence either at any
            point during Flower Battle gameplay. */}
        <div className="flex shrink-0 items-center gap-1">
          <AvToggles />
        </div>
      </div>

      {/* Status row — growth stage + sun points. aria-live=polite so screen
          readers pick up changes without interrupting mid-question. */}
      <div
        data-testid="flower-battle-topbar-status"
        role="status"
        aria-live="polite"
        className={`flex w-full flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold ${colors.bg}`.trim()}
      >
        <span data-testid="flower-battle-topbar-status-line">{statusLine}</span>
        {view.effectKinds.map((kind) => {
          const meta = EFFECT_META[kind]
          return (
            <span
              key={kind}
              data-testid={meta.testId}
              data-effect-kind={kind}
              className="text-ink-subtle text-xs font-normal"
            >
              {meta.defaultValue}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default FlowerTopbarVariant
