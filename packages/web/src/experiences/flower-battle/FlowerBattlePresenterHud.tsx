import { useTranslation } from "react-i18next"

import {
  ExperienceHud,
  type ExperienceHudProps,
} from "../shared/hud/ExperienceHud"
import { AnswerCounter } from "../shared/hud/AnswerCounter"
import {
  CountdownDisplay,
  type CountdownDisplayProps,
} from "../shared/hud/CountdownDisplay"
import { StatusBanner } from "../shared/hud/StatusBanner"
import type {
  FlowerBattleTeamState,
  PowerUpData,
} from "./flower-battle-scene.types"

const POWERUP_LABEL_KEYS: Record<string, string> = {
  fertilizer: "flowerBattlePresenter.powerUp.fertilizer",
  sunbeam: "flowerBattlePresenter.powerUp.sunbeam",
  umbrella_shield: "flowerBattlePresenter.powerUp.umbrellaShield",
  acid_rain: "flowerBattlePresenter.powerUp.acidRain",
}

type FlowerBattleCountdownProps = CountdownDisplayProps

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
  /**
   * @deprecated kept for backwards-compatible call sites; team cards are
   * rendered UNDER each plant in the scene (PlantTeamCard) and no longer
   * drawn globally by this HUD (FB-HUD4 / Gartenmodus-Korrektur).
   */
  teams?: FlowerBattleTeamState[]
  /** @deprecated — same reason as `teams`. Sun points live in PlantTeamCard. */
  sunPoints?: Record<string, number>
  powerUp?: PowerUpData
  powerUpChoiceMessage?: string
  /**
   * `overlay` — absolute safe-zone cards over full-bleed canvas (immersive).
   * `flow` — stacked flex column (legacy / tests that assert flow layout).
   */
  variant?: "overlay" | "flow"
  countdown?: FlowerBattleCountdownProps
}

/**
 * FlowerBattlePresenterHud — additive presenter HUD for Flower Battle (WP-937).
 * Composes ExperienceHud + kit primitives; never renders question/answer text.
 *
 * FB-HUD4 (Gartenmodus-Korrektur): team cards are NOT part of this HUD
 * anymore. The presenter HUD only owns the central timer (CountdownDisplay)
 * and the bottom-right answer counter (AnswerCounter), plus an optional
 * status banner. Per-team compact cards live UNDER each plant in the scene
 * (PlantTeamCard). The wrapper is fully transparent — the visual scene
 * (PixiJS canvas) shines through everywhere except the explicit safe-zone
 * chips. `flower-battle-team-meters` and `flower-battle-team-hud-*` testids
 * no longer exist; tests must update to use the scene-level team cards.
 */
export const FlowerBattlePresenterHud = ({
  teams,
  powerUp,
  powerUpChoiceMessage,
  className = "",
  statusBanner,
  variant = "overlay",
  answerCounter,
  countdown,
  ...experienceHudProps
}: FlowerBattlePresenterHudProps) => {
  const { t } = useTranslation("experience_hud")
  // Teams are rendered as compact cards UNDER each plant (PlantTeamCard) in
  // the garden scene, not as a global bottom HUD anymore (FB-HUD4). The
  // presenter HUD only owns the central timer + answer counter plus the
  // status banner. Keeping the `teams` prop on the interface so callers
  // (and flow-variant tests) keep working, but never mapping it to a global
  // card row.
  void teams

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
              teamName: powerUp.teamName ?? "",
              powerUp: t(POWERUP_LABEL_KEYS[powerUp.type] ?? powerUp.type, {
                defaultValue: powerUp.type,
              }),
            }),
          }
        : undefined

  const mergedStatusBanner = powerUpBanner ?? statusBanner
  const showBottomHud = Boolean(countdown || answerCounter)

  if (variant === "overlay") {
    return (
      <div
        data-testid="flower-battle-presenter-hud"
        data-hud-variant="overlay"
        className={`garden-top-hud relative h-full w-full bg-transparent ${className}`.trim()}
      >
        {mergedStatusBanner ? (
          <div
            data-testid="flower-battle-event-banner"
            className="pointer-events-auto absolute top-[var(--experience-safe-top,4.75rem)] left-1/2 z-[25] w-[min(36rem,90%)] -translate-x-1/2"
          >
            <StatusBanner {...mergedStatusBanner} />
          </div>
        ) : null}

        {showBottomHud ? (
          <div
            data-testid="flower-battle-bottom-hud"
            className="garden-bottom-hud pointer-events-none absolute right-[var(--experience-safe-right,0.75rem)] bottom-[var(--experience-safe-bottom-pad,0.75rem)] left-[var(--experience-safe-left,0.75rem)] z-20 flex items-end justify-between gap-2 sm:gap-3"
          >
            <div
              data-testid="flower-battle-timer-slot"
              className="pointer-events-auto flex flex-1 items-end justify-center"
            >
              {countdown ? <CountdownDisplay {...countdown} /> : null}
            </div>

            <div
              data-testid="flower-battle-answer-counter-slot"
              className="pointer-events-auto flex items-end justify-end"
            >
              {answerCounter ? <AnswerCounter {...answerCounter} /> : null}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // Legacy flow layout (tests / non-immersive embeds). No team-meters grid —
  // team cards live under each plant in the scene, never as a global row.
  return (
    <div
      data-testid="flower-battle-presenter-hud"
      data-hud-variant="flow"
      className={`flex w-full flex-col gap-3 bg-transparent ${className}`.trim()}
    >
      <ExperienceHud
        {...experienceHudProps}
        answerCounter={answerCounter}
        countdown={countdown}
        statusBanner={mergedStatusBanner}
        className="shrink-0"
      />
    </div>
  )
}
