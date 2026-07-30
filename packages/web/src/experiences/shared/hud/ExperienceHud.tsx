import { useTranslation } from "react-i18next"

import { AnswerCounter, type AnswerCounterProps } from "./AnswerCounter"
import {
  CountdownDisplay,
  type CountdownDisplayProps,
} from "./CountdownDisplay"
import { PhaseIndicator, type PhaseIndicatorProps } from "./PhaseIndicator"
import { RoundProgress, type RoundProgressProps } from "./RoundProgress"
import { StatusBanner, type StatusBannerProps } from "./StatusBanner"

export interface ExperienceHudProps {
  /** Props forwarded verbatim to RoundProgress (rendered bottom-left). */
  roundProgress?: RoundProgressProps
  /** Props forwarded verbatim to AnswerCounter (rendered bottom-right). */
  answerCounter?: AnswerCounterProps
  /** Props forwarded verbatim to PhaseIndicator (rendered top-left). */
  phaseIndicator?: PhaseIndicatorProps
  /** Props forwarded verbatim to CountdownDisplay (rendered top-right). */
  countdown?: CountdownDisplayProps
  /** Props forwarded verbatim to StatusBanner (rendered center). */
  statusBanner?: StatusBannerProps
  className?: string
  /**
   * Structural content guard (WP-KIT-05): question/answer/player payloads
   * are `never` here, so TypeScript rejects them at compile time. Declared
   * inline per HUD primitive (no shared types file) to keep the module
   * count at exactly 7.
   */
  readonly question?: never
  readonly questions?: never
  readonly answer?: never
  readonly answers?: never
  readonly player?: never
  readonly players?: never
  readonly playerData?: never
}

/**
 * ExperienceHud — composition root for the Experience-Kit HUD primitives
 * (WP #908, Stage Layer 4 "hud").
 *
 * Pure layout: it composes the five primitives and forwards their props
 * verbatim. It owns NO progress logic, NO countdown logic and NO state —
 * callers describe WHAT to display; computation lives upstream (#910 wiring).
 */
export const ExperienceHud = ({
  roundProgress,
  answerCounter,
  phaseIndicator,
  countdown,
  statusBanner,
  className = "",
}: ExperienceHudProps) => {
  const { t } = useTranslation("experience_hud")

  return (
    <div
      data-testid="experience-hud"
      role="region"
      aria-label={t("hud.regionLabel")}
      className={`flex h-full w-full flex-col justify-between gap-4 p-4 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-4">
        <div>{phaseIndicator && <PhaseIndicator {...phaseIndicator} />}</div>
        <div>{countdown && <CountdownDisplay {...countdown} />}</div>
      </div>
      {statusBanner && (
        <div className="flex justify-center">
          <StatusBanner {...statusBanner} />
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="w-full max-w-xs">
          {roundProgress && <RoundProgress {...roundProgress} />}
        </div>
        <div>{answerCounter && <AnswerCounter {...answerCounter} />}</div>
      </div>
    </div>
  )
}
