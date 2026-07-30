import { TEAMS } from "@razzoozle/common/constants"
import type { Team } from "@razzoozle/common/constants"
import { CloudRain, Sprout, Sun, Umbrella } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  POWERUP_ICONS,
  type PowerupType,
} from "@razzoozle/web/features/game/components/player/flower-battle.types"
import { teamColor } from "@razzoozle/web/features/game/utils/teams"

import { ExperienceHud, type ExperienceHudProps } from "../shared/hud/ExperienceHud"
import { PhaseIndicator } from "../shared/hud/PhaseIndicator"
import { RoundProgress } from "../shared/hud/RoundProgress"
import type {
  FlowerBattleActiveEffect,
  FlowerBattleSunPointsByTeam,
  FlowerBattleTeamState,
  PowerUpData,
} from "./flower-battle-scene.types"

const MAX_SUN_POINTS = 3
const MAX_TEAMS = 4

const EFFECT_ICONS: Record<FlowerBattleActiveEffect, typeof Sun> = {
  sunbeam: Sun,
  umbrella_shield: Umbrella,
  acid_rain: CloudRain,
}

const EFFECT_LABEL_KEYS: Record<FlowerBattleActiveEffect, string> = {
  sunbeam: "flowerBattlePresenter.effect.sunbeam",
  umbrella_shield: "flowerBattlePresenter.effect.umbrellaShield",
  acid_rain: "flowerBattlePresenter.effect.acidRain",
}

const POWERUP_LABEL_KEYS: Record<PowerupType, string> = {
  fertilizer: "flowerBattlePresenter.powerUp.fertilizer",
  sunbeam: "flowerBattlePresenter.powerUp.sunbeam",
  umbrella_shield: "flowerBattlePresenter.powerUp.umbrellaShield",
  acid_rain: "flowerBattlePresenter.powerUp.acidRain",
}

export interface FlowerBattlePresenterHudProps
  extends Omit<
    ExperienceHudProps,
    "question" | "questions" | "answer" | "answers" | "player" | "players" | "playerData"
  > {
  teams: FlowerBattleTeamState[]
  sunPoints: FlowerBattleSunPointsByTeam
  powerUp?: PowerUpData
  powerUpChoiceMessage?: string
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
  return Number.isFinite(raw) ? Math.min(MAX_SUN_POINTS, Math.max(0, Math.floor(raw))) : 0
}

const sunPointsToPercent = (points: number): number =>
  Math.round((points / MAX_SUN_POINTS) * 100)

/**
 * FlowerBattlePresenterHud — additive presenter HUD for Flower Battle (WP-937).
 * Composes ExperienceHud + kit primitives; never renders question/answer text.
 */
export const FlowerBattlePresenterHud = ({
  teams,
  sunPoints,
  powerUp,
  powerUpChoiceMessage,
  className = "",
  statusBanner,
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

  return (
    <div
      data-testid="flower-battle-presenter-hud"
      className={`flex h-full w-full flex-col gap-3 ${className}`.trim()}
    >
      <ExperienceHud
        {...experienceHudProps}
        statusBanner={mergedStatusBanner}
        className="shrink-0"
      />

      <div
        data-testid="flower-battle-team-meters"
        className="grid flex-1 gap-3 px-[5%] sm:grid-cols-2 lg:grid-cols-4"
      >
        {visibleTeams.map((team, index) => {
          const teamKey = teamKeyForIndex(index)
          const points = resolveSunPoints(team, index, sunPoints)
          const colors = teamColor(teamKey)
          const PowerUpIcon = powerUp?.type ? POWERUP_ICONS[powerUp.type] : Sprout

          return (
            <section
              key={`${team.name}-${index}`}
              data-testid={`flower-battle-team-hud-${index}`}
              className={`flex flex-col gap-2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-3 ${colors.bg}`}
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

              {team.effects.length > 0 ? (
                <ul
                  data-testid={`flower-battle-team-effects-${index}`}
                  className="flex flex-col gap-1"
                >
                  {team.effects.map((effect) => {
                    const EffectIcon = EFFECT_ICONS[effect]
                    return (
                      <li
                        key={effect}
                        data-testid={`flower-battle-effect-${effect}-${index}`}
                        className={`inline-flex items-center gap-2 text-xs ${colors.text}`}
                      >
                        <EffectIcon aria-hidden className="size-4 shrink-0" />
                        <span>
                          {t(EFFECT_LABEL_KEYS[effect], {
                            defaultValue: effect,
                          })}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : null}

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
        })}
      </div>
    </div>
  )
}
