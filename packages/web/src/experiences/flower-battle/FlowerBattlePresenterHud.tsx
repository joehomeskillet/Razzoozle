import { TEAMS } from "@razzoozle/common/constants"
import type { Team } from "@razzoozle/common/constants"
import { Sprout } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  POWERUP_ICONS,
  type PowerupType,
} from "@razzoozle/web/features/game/components/player/flower-battle.types"
import { teamColor } from "@razzoozle/web/features/game/utils/teams"

import {
  ExperienceHud,
  type ExperienceHudProps,
} from "../shared/hud/ExperienceHud"
import { AnswerCounter } from "../shared/hud/AnswerCounter"
import { PhaseIndicator } from "../shared/hud/PhaseIndicator"
import { RoundProgress } from "../shared/hud/RoundProgress"
import { StatusBanner } from "../shared/hud/StatusBanner"
import { FlowerPowerupStatusIcons } from "./FlowerPowerupStatusIcons"
import type {
  FlowerBattleSunPointsByTeam,
  FlowerBattleTeamState,
  PowerUpData,
} from "./flower-battle-scene.types"

const MAX_SUN_POINTS = 3
const MAX_TEAMS = 4

const POWERUP_LABEL_KEYS: Record<PowerupType, string> = {
  fertilizer: "flowerBattlePresenter.powerUp.fertilizer",
  sunbeam: "flowerBattlePresenter.powerUp.sunbeam",
  umbrella_shield: "flowerBattlePresenter.powerUp.umbrellaShield",
  acid_rain: "flowerBattlePresenter.powerUp.acidRain",
}

/** Glass surface for floating HUD cards over the garden canvas. */
const OVERLAY_SURFACE =
  "rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] shadow-md backdrop-blur-sm"

export interface FlowerBattlePresenterHudProps extends Omit<
  ExperienceHudProps,
  | "question"
  | "questions"
  | "answer"
  | "answers"
  | "player"
  | "players"
  | "playerData"
> {
  teams: FlowerBattleTeamState[]
  sunPoints: FlowerBattleSunPointsByTeam
  powerUp?: PowerUpData
  powerUpChoiceMessage?: string
  /**
   * `overlay` — absolute safe-zone cards over full-bleed canvas (immersive).
   * `flow` — stacked flex column (legacy / tests that assert flow layout).
   */
  variant?: "overlay" | "flow"
}

const teamKeyForIndex = (index: number): Team => TEAMS[index] ?? TEAMS[0]

const resolveSunPoints = (
  team: FlowerBattleTeamState,
  index: number,
  sunPoints: FlowerBattleSunPointsByTeam,
): number => {
  const teamKey = teamKeyForIndex(index)
  const override = sunPoints[teamKey]
  const raw = override ?? team.sunPoints
  return Number.isFinite(raw)
    ? Math.min(MAX_SUN_POINTS, Math.max(0, Math.floor(raw)))
    : 0
}

const sunPointsToPercent = (points: number): number =>
  Math.round((points / MAX_SUN_POINTS) * 100)

/**
 * FlowerBattlePresenterHud — additive presenter HUD for Flower Battle (WP-937).
 * Composes ExperienceHud + kit primitives; never renders question/answer text.
 * WP-938.2: Integrates FlowerPowerupStatusIcons for active effect display.
 *
 * Immersive overlay variant places team meters / answer counter as floating
 * chips inside the experience safe area so they never sit outside the canvas.
 */
export const FlowerBattlePresenterHud = ({
  teams,
  sunPoints,
  powerUp,
  powerUpChoiceMessage,
  className = "",
  statusBanner,
  variant = "overlay",
  answerCounter,
  ...experienceHudProps
}: FlowerBattlePresenterHudProps) => {
  const { t } = useTranslation("experience_hud")
  const visibleTeams = teams.slice(0, MAX_TEAMS)

  const powerUpBanner =
    powerUpChoiceMessage && powerUpChoiceMessage.length > 0
      ? {
          type: "info" as const,
          message: powerUpChoiceMessage,
        }
      : powerUp
        ? {
            type: "info" as const,
            message: t("flowerBattlePresenter.powerUpChoice", {
              defaultValue: "Team {{teamName}} wählt {{powerUp}}",
              teamName: powerUp.teamName ?? visibleTeams[0]?.name ?? "",
              powerUp: t(POWERUP_LABEL_KEYS[powerUp.type], {
                defaultValue: powerUp.type,
              }),
            }),
          }
        : undefined

  const mergedStatusBanner = powerUpBanner ?? statusBanner

  const teamCards = visibleTeams.map((team, index) => {
    const teamKey = teamKeyForIndex(index)
    const points = resolveSunPoints(team, index, sunPoints)
    const colors = teamColor(teamKey)
    const PowerUpIcon = powerUp?.type ? POWERUP_ICONS[powerUp.type] : Sprout

    return (
      <section
        key={`${team.name}-${index}`}
        data-testid={`flower-battle-team-hud-${index}`}
        className={`flex min-w-0 flex-col gap-1.5 p-2 sm:gap-2 sm:p-2.5 ${OVERLAY_SURFACE} ${colors.bg}`}
      >
        <PhaseIndicator
          current={points}
          total={MAX_SUN_POINTS}
          label={team.name}
        />

        <RoundProgress
          value={sunPointsToPercent(points)}
          label={t("flowerBattlePresenter.sunPoints.label", {
            defaultValue: "Sonnenpunkte",
          })}
          variant={points >= MAX_SUN_POINTS ? "success" : "default"}
        />

        {team.effects && team.effects.length > 0 && (
          <FlowerPowerupStatusIcons activeEffects={team.effects} />
        )}

        {powerUp && powerUp.teamName === team.name ? (
          <div
            data-testid={`flower-battle-powerup-status-${index}`}
            className={`inline-flex items-center gap-2 text-xs font-medium ${colors.text}`}
          >
            <PowerUpIcon aria-hidden className="size-4 shrink-0" />
            <span>
              {t(POWERUP_LABEL_KEYS[powerUp.type], {
                defaultValue: powerUp.type,
              })}
            </span>
          </div>
        ) : null}
      </section>
    )
  })

  if (variant === "overlay") {
    return (
      <div
        data-testid="flower-battle-presenter-hud"
        data-hud-variant="overlay"
        className={`relative h-full w-full ${className}`.trim()}
      >
        {mergedStatusBanner ? (
          <div
            data-testid="flower-battle-event-banner"
            className="pointer-events-auto absolute top-[var(--experience-safe-top,4.75rem)] left-1/2 z-[25] w-[min(36rem,90%)] -translate-x-1/2"
          >
            <StatusBanner {...mergedStatusBanner} />
          </div>
        ) : null}

        <div
          data-testid="flower-battle-team-meters"
          className="pointer-events-auto absolute bottom-[var(--experience-safe-bottom-pad,0.75rem)] left-[var(--experience-safe-left,0.75rem)] z-20 flex max-w-[min(52rem,68%)] flex-row flex-wrap gap-2"
        >
          {teamCards}
        </div>

        {answerCounter ? (
          <div className="pointer-events-auto absolute right-[var(--experience-safe-right,0.75rem)] bottom-[var(--experience-safe-bottom-pad,0.75rem)] z-20">
            <AnswerCounter {...answerCounter} />
          </div>
        ) : null}
      </div>
    )
  }

  // Legacy flow layout (tests / non-immersive embeds).
  return (
    <div
      data-testid="flower-battle-presenter-hud"
      data-hud-variant="flow"
      className={`flex w-full flex-col gap-3 ${className}`.trim()}
    >
      <ExperienceHud
        {...experienceHudProps}
        answerCounter={answerCounter}
        statusBanner={mergedStatusBanner}
        className="shrink-0"
      />

      <div
        data-testid="flower-battle-team-meters"
        className="grid flex-1 gap-3 px-[5%] sm:grid-cols-2 lg:grid-cols-4"
      >
        {teamCards}
      </div>
    </div>
  )
}
