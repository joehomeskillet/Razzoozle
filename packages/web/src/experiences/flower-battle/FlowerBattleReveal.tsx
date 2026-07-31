/**
 * FlowerBattleReveal — Comic-style result-screen reaction for Flower Battle.
 *
 * SDD §15–17:
 *   §15 correct:      FlowerPlant grows + opens petals; small Check-Sticker under
 *                     the bloom; 3–5 sparkles; headline "Richtig"; subline
 *                     "Deine Blüte wächst!"; growth + sun progress animate from
 *                     the previous state to the new one.
 *   §16 incorrect:    mildly disappointed but not shaming plant reaction; small
 *                     X-/Impact-Sticker; headline "Schade"; contrast-rich card
 *                     with the correct answer — no large red full-bleed.
 *   §17 special:      timeout, no answer, partial, multiple correct, server
 *                     corrected, reconnect — all keep the same layout family.
 *
 * No bg-[var(--state-correct)] full-bleed, no oversized check circle. The plant
 * + sticker + sparkles are the entire reaction. Reduced-motion falls back to
 * an opacity-only state change (no sparkles, no scale wobble).
 *
 * File path: `src/experiences/flower-battle/` to keep all Flower Battle
 * Player-side reveals together with `FlowerBattlePlayerStatus`, `FlowerPlant`,
 * and `FlowerPowerupEffects`. The component is HTML-only (no PixiJS) per
 * SDD §15–17's spirit.
 */

import { useId } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"

import type { FlowerBattlePlayerStatus as FlowerBattlePlayerStatusData } from "@razzoozle/common/types/game/socket"
import { teamColor } from "@razzoozle/web/features/game/utils/teams"

import { FlowerPlant } from "./FlowerPlant"
import { clampGrowthStage, GROWTH_STAGE_MAX, type TeamColorKey } from "./flower-plant.constants"

export type FlowerBattleRevealKind =
  | "correct"
  | "incorrect"
  | "timeout"
  | "noAnswer"
  | "partial"
  | "serverCorrected"
  | "reconnect"
  | "multipleCorrect"

export interface FlowerBattleRevealProps {
  kind: FlowerBattleRevealKind
  status: FlowerBattlePlayerStatusData
  previousStatus?: FlowerBattlePlayerStatusData | null
  /** Optional correct-answer text for the "Schade" card (§16). */
  correctAnswer?: string | null
  /** Optional headline override (defaults to i18n for the kind). */
  headline?: string | null
  /** Optional subline override (defaults to i18n for the kind). */
  subline?: string | null
  /** Allow callers to set a custom testid root for snapshots. */
  testIdPrefix?: string
}

const TEAM_COLOR_KEYS = ["red", "blue", "green", "yellow"] as const

const isTeamColorKey = (value: string | null | undefined): value is TeamColorKey =>
  typeof value === "string" && (TEAM_COLOR_KEYS as readonly string[]).includes(value)

const SPARKLE_DELAYS: readonly number[] = [0, 0.12, 0.24, 0.36, 0.48]

const MAX_SUN_POINTS = 3

/**
 * Sparkle — small SVG star used as comic-support particle. Faithful to the
 * POWERUP design language (no hex, no arbitrary classes — uses current text
 * colour so the accent flows through).
 */
const Sparkle = ({ delay }: { delay: number }) => (
  <motion.span
    data-testid="flower-battle-reveal-sparkle"
    data-delay={delay}
    initial={{ opacity: 0, scale: 0.4 }}
    animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
    transition={{ duration: 0.9, delay, repeat: 1, ease: "easeOut" }}
    className="text-accent pointer-events-none absolute inline-flex h-3 w-3 items-center justify-center"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" className="h-full w-full fill-current" focusable="false">
      <path d="M12 1.5 14.5 9 22 11.5 14.5 14 12 22.5 9.5 14 2 11.5 9.5 9z" />
    </svg>
  </motion.span>
)

/**
 * CheckSticker — small comic check mark (40px, not a full-bleed). Anchored
 * bottom-right of the plant to look like a supporting accent, not the headline.
 */
const CheckSticker = ({ reduced }: { reduced: boolean }) => (
  <motion.div
    data-testid="flower-battle-reveal-check-sticker"
    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -12 }}
    animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: -8 }}
    transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.45 }}
    className="border-line bg-state-correct-soft text-state-correct inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={3} focusable="false">
      <path d="M4 12 l5 5 L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </motion.div>
)

/**
 * XSticker — small comic X / impact glyph. Same scale as CheckSticker so the
 * "Schade" blueprint stays symmetric (§16 — nicht beschämend).
 */
const XSticker = ({ reduced }: { reduced: boolean }) => (
  <motion.div
    data-testid="flower-battle-reveal-x-sticker"
    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: 8 }}
    animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 6 }}
    transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.45 }}
    className="border-line bg-state-wrong-soft text-state-wrong inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={3} focusable="false">
      <path d="M6 6 L18 18 M18 6 L6 18" strokeLinecap="round" />
    </svg>
  </motion.div>
)

const NEUTRAL_LABEL: Partial<Record<FlowerBattleRevealKind, string>> = {
  timeout: "⏱",
  noAnswer: "—",
  partial: "½",
  serverCorrected: "↻",
  reconnect: "↺",
  multipleCorrect: "★",
}

/**
 * NeutralSticker — small dashed ring for §17 special states. Same footprint
 * as the check/x sticker so the layout family stays consistent.
 */
const NeutralSticker = ({ reduced, label }: { reduced: boolean; label: string }) => (
  <motion.div
    data-testid="flower-battle-reveal-neutral-sticker"
    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
    animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
    transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.4 }}
    className="border-line bg-surface-2 text-ink-subtle inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed"
    aria-hidden="true"
  >
    <span className="text-sm font-semibold">{label}</span>
  </motion.div>
)

const GROWTH_DELTA = (current: number, previous: number | null): number => {
  if (previous == null) return 0
  return Math.max(0, current - previous)
}

const KIND_TO_I18N: Record<FlowerBattleRevealKind, { headline: string; subline: string }> = {
  correct: {
    headline: "flowerBattle.reveal.correct.headline",
    subline: "flowerBattle.reveal.correct.subline",
  },
  incorrect: {
    headline: "flowerBattle.reveal.incorrect.headline",
    subline: "flowerBattle.reveal.incorrect.subline",
  },
  timeout: {
    headline: "flowerBattle.reveal.timeout.headline",
    subline: "flowerBattle.reveal.timeout.subline",
  },
  noAnswer: {
    headline: "flowerBattle.reveal.noAnswer.headline",
    subline: "flowerBattle.reveal.noAnswer.subline",
  },
  partial: {
    headline: "flowerBattle.reveal.partial.headline",
    subline: "flowerBattle.reveal.partial.subline",
  },
  serverCorrected: {
    headline: "flowerBattle.reveal.serverCorrected.headline",
    subline: "flowerBattle.reveal.serverCorrected.subline",
  },
  reconnect: {
    headline: "flowerBattle.reveal.reconnect.headline",
    subline: "flowerBattle.reveal.reconnect.subline",
  },
  multipleCorrect: {
    headline: "flowerBattle.reveal.multipleCorrect.headline",
    subline: "flowerBattle.reveal.multipleCorrect.subline",
  },
}

const KIND_DEFAULTS: Record<FlowerBattleRevealKind, { headline: string; subline: string }> = {
  correct: { headline: "Richtig", subline: "Deine Blüte wächst!" },
  incorrect: { headline: "Schade", subline: "Versuch's beim nächsten Mal!" },
  timeout: { headline: "Zeit um", subline: "Keine Antwort gewertet." },
  noAnswer: { headline: "Keine Antwort", subline: "Diesmal leer ausgegangen." },
  partial: { headline: "Teilpunkte", subline: "Ein bisschen Sonne für dein Team." },
  serverCorrected: { headline: "Korrigiert", subline: "Antwort wurde nachträglich angepasst." },
  reconnect: { headline: "Weiter im Rennen", subline: "Du bist wieder dabei." },
  multipleCorrect: { headline: "Mehrere richtig", subline: "Mehr als eine Antwort zählte." },
}

/**
 * FlowerBattleReveal — comic-style result reaction for the Flower Battle
 * Player Client. Pure HTML (no PixiJS), no full-bleed background fills, no
 * oversized check circles. Plant + sticker + sparkles + headline card.
 */
export function FlowerBattleReveal({
  kind,
  status,
  previousStatus = null,
  correctAnswer = null,
  headline = null,
  subline = null,
  testIdPrefix = "flower-battle-reveal",
}: FlowerBattleRevealProps) {
  const reduced = Boolean(useReducedMotion())
  const { t } = useTranslation("game")
  const labelId = useId()

  const team: TeamColorKey | undefined = isTeamColorKey(status.teamId)
    ? status.teamId
    : undefined
  const colors = team ? teamColor(team) : { bg: "", text: "text-ink" }

  const stage = clampGrowthStage(status.growthStage)
  const previousStage = previousStatus
    ? clampGrowthStage(previousStatus.growthStage)
    : null
  const stageDelta = GROWTH_DELTA(stage, previousStage)

  const keys = KIND_TO_I18N[kind]
  const defaults = KIND_DEFAULTS[kind]
  const resolvedHeadline = headline ?? t(keys.headline, { defaultValue: defaults.headline })
  const resolvedSubline = subline ?? t(keys.subline, { defaultValue: defaults.subline })

  const showCorrectAnswer = kind === "incorrect" && Boolean(correctAnswer)

  const renderSticker = () => {
    if (kind === "correct") return <CheckSticker reduced={reduced} />
    if (kind === "incorrect") return <XSticker reduced={reduced} />
    const label = NEUTRAL_LABEL[kind] ?? "•"
    return <NeutralSticker reduced={reduced} label={label} />
  }

  return (
    <section
      data-testid={testIdPrefix}
      data-kind={kind}
      data-reduced-motion={reduced ? "true" : "false"}
      role="status"
      aria-labelledby={labelId}
      className={`relative mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-6 ${colors.bg}`.trim()}
    >
      <span id={labelId} className="sr-only">
        {resolvedHeadline}
        {resolvedSubline ? `. ${resolvedSubline}` : ""}
      </span>

      {/* Comic stage: plant + sticker + sparkles. No full-bleed bg. */}
      <div
        className="relative flex h-56 w-full items-end justify-center"
        data-testid={`${testIdPrefix}-stage`}
      >
        {/* Sparkles — only on correct, only when motion is allowed (§15). */}
        {kind === "correct" && !reduced && (
          <div
            className="pointer-events-none absolute inset-0"
            data-testid={`${testIdPrefix}-sparkles`}
          >
            {SPARKLE_DELAYS.map((d) => (
              <span
                key={d}
                className="absolute"
                style={{
                  left: `${20 + d * 60}%`,
                  top: `${15 + (d * 7) % 20}%`,
                }}
              >
                <Sparkle delay={d} />
              </span>
            ))}
          </div>
        )}

        <motion.div
          className="relative h-48 w-32"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
        >
          <FlowerPlant growthStage={stage} variant="round" teamColor={team} />
          <div className="absolute -bottom-1 -right-2">{renderSticker()}</div>
        </motion.div>
      </div>

      {/* Headline + subline */}
      <header className="text-center">
        <h2 className={`text-3xl font-bold ${colors.text} md:text-4xl`}>
          {resolvedHeadline}
        </h2>
        {resolvedSubline && (
          <p className="text-ink-subtle mt-1 text-base md:text-lg">{resolvedSubline}</p>
        )}
      </header>

      {/* Growth/sun delta — small §15 progress bit. */}
      <div
        data-testid={`${testIdPrefix}-progress`}
        className="border-line bg-surface-2 text-ink-subtle flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm"
        aria-live="polite"
      >
        <span data-testid={`${testIdPrefix}-stage-line`}>
          {t("flowerBattle.reveal.stageLine", {
            defaultValue: `Blüte ${stage}/${GROWTH_STAGE_MAX}`,
            stage,
            max: GROWTH_STAGE_MAX,
          })}
        </span>
        <span aria-hidden="true">·</span>
        <span data-testid={`${testIdPrefix}-sun-line`}>
          {t("flowerBattle.reveal.sunLine", {
            defaultValue: `☀ ${status.sunPoints}/${MAX_SUN_POINTS}`,
            sunPoints: status.sunPoints,
            max: MAX_SUN_POINTS,
          })}
        </span>
        {stageDelta > 0 && (
          <span
            data-testid={`${testIdPrefix}-growth-delta`}
            className="text-state-correct text-xs font-semibold"
          >
            {t("flowerBattle.reveal.growthDelta", {
              defaultValue: `+${stageDelta} Wachstum`,
              count: stageDelta,
            })}
          </span>
        )}
      </div>

      {/* §16 — contrasting "Richtige Antwort" card for wrong-answer reveals. */}
      {showCorrectAnswer && (
        <div
          data-testid={`${testIdPrefix}-correct-answer-card`}
          className="border-line bg-surface-2 text-ink mx-auto flex w-full max-w-md items-start gap-3 rounded-2xl border-2 px-4 py-3 shadow-sm"
        >
          <span className="text-ink-subtle text-xs font-semibold uppercase tracking-wide">
            {t("flowerBattle.reveal.correctAnswerLabel", {
              defaultValue: "Richtige Antwort",
            })}
          </span>
          <span className="text-ink text-base font-semibold">{correctAnswer}</span>
        </div>
      )}
    </section>
  )
}

export default FlowerBattleReveal
