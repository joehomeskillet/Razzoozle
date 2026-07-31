/**
 * FlowerEventBubble — Comic-style speech bubble for power-up events in the
 * Flower Battle presenter garden (SDD §20.5).
 *
 * Rendered as an HTML overlay above the Pixi canvas host. Auto-dismisses after
 * ~3s, replaces prior event on new arrival (no stacking), and respects
 * prefers-reduced-motion (opacity-only fade, no slide/scale). Anchored to the
 * top of the safe area so it never sits under the presenter shell and never
 * blocks any of the four plant slots.
 */

import { useEffect, useId, useRef } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"

import {
  POWERUP_TYPES,
  type PowerupType,
} from "@razzoozle/web/features/game/components/player/flower-battle.types"

/** Visible lifetime of a single bubble; deterministic per SDD §20.5. */
export const EVENT_BUBBLE_VISIBLE_MS = 3_000

/**
 * Authoritative presenter event — drives the bubble. Built from the
 * POWERUP_APPLIED envelope but trimmed to the fields the presenter actually
 * needs (no scoring/effect details, no gameId).
 */
export interface FlowerEventBubbleEvent {
  teamId: string
  powerupType: PowerupType
  issuedAtServerMs: number
}

export interface FlowerEventBubbleProps {
  event: FlowerEventBubbleEvent | null
  onDismiss: () => void
}

/** `optionId` on the wire is one of the 4 PowerupType ids. */
const POWERUP_I18N_NAME_KEYS: Record<PowerupType, string> = {
  fertilizer: "flowerBattle.powerupVote.options.fertilizer.name",
  sunbeam: "flowerBattle.powerupVote.options.sunbeam.name",
  umbrella_shield: "flowerBattle.powerupVote.options.umbrella_shield.name",
  acid_rain: "flowerBattle.powerupVote.options.acid_rain.name",
}

const POWERUP_DEFAULTS: Record<PowerupType, string> = {
  fertilizer: "Dünger",
  sunbeam: "Sonnenstrahl",
  umbrella_shield: "Schirm-Schild",
  acid_rain: "Saurer Regen",
}

const TEAM_DEFAULTS: Record<string, string> = {
  red: "Team Rot",
  blue: "Team Blau",
  green: "Team Grün",
  yellow: "Team Gelb",
}

/**
 * Schedule a deterministic dismiss after EVENT_BUBBLE_VISIBLE_MS. Exported so
 * the timer contract (visible window + cancellation) is testable in isolation
 * without standing up a DOM for React's effect loop.
 */
export const scheduleBubbleDismiss = (
  onDismiss: () => void,
  setHandle: (handle: ReturnType<typeof setTimeout> | null) => void,
  visibleMs: number = EVENT_BUBBLE_VISIBLE_MS,
  setTimeoutImpl: typeof setTimeout = setTimeout,
): (() => void) => {
  const handle = setTimeoutImpl(() => {
    setHandle(null)
    onDismiss()
  }, visibleMs)
  setHandle(handle)
  return () => {
    if (handle !== null) {
      clearTimeout(handle)
      setHandle(null)
    }
  }
}

/**
 * Resolve a powerup optionId from the wire to a known PowerupType, falling back
 * to the first known type when the wire payload is missing/unknown. The bubble
 * never renders a blank label.
 */
const resolvePowerupType = (raw: string): PowerupType => {
  if ((POWERUP_TYPES as readonly string[]).includes(raw)) {
    return raw as PowerupType
  }
  return POWERUP_TYPES[0]
}

/**
 * FlowerEventBubble — transient floating speech bubble. Renders nothing when
 * `event` is null. Owns its own dismiss timer; parent only needs to clear its
 * `event` state when calling onDismiss or when swapping to a new event.
 */
export function FlowerEventBubble({ event, onDismiss }: FlowerEventBubbleProps) {
  const reduced = Boolean(useReducedMotion())
  const { t } = useTranslation("game")
  const labelId = useId()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset the auto-dismiss timer whenever a new event arrives. The bubble
  // REPLACES the previous one (no stacking per SDD §20.5).
  useEffect(() => {
    if (!event) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    const cancel = scheduleBubbleDismiss(onDismiss, (h) => {
      timerRef.current = h
    })
    return cancel
  }, [event, onDismiss])

  if (!event) return null

  const powerup = resolvePowerupType(event.powerupType)
  const teamName = t(`flowerBattle.powerupVote.teamNames.${event.teamId}`, {
    defaultValue: TEAM_DEFAULTS[event.teamId] ?? event.teamId,
  })
  const powerupName = t(POWERUP_I18N_NAME_KEYS[powerup], {
    defaultValue: POWERUP_DEFAULTS[powerup],
  })
  const message = t("flowerBattle.eventBubble.teamAction", {
    defaultValue: "Team {{teamName}} setzt {{powerupName}} ein",
    teamName,
    powerupName,
  })

  return (
    <motion.div
      data-testid="flower-event-bubble"
      data-team-id={event.teamId}
      data-powerup-type={powerup}
      data-issued-at-server-ms={event.issuedAtServerMs}
      data-reduced-motion={reduced ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-labelledby={labelId}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, rotate: -2 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: -2 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="pointer-events-none absolute left-1/2 top-[18%] z-10 -translate-x-1/2"
    >
      <div
        data-testid="flower-event-bubble-card"
        className="border-line bg-surface-2 text-ink relative inline-flex max-w-[80vw] items-center gap-3 rounded-2xl border-2 px-5 py-3 shadow-md"
      >
        {/* Comic accent burst — small SVG sticker that anchors the bubble to the
            comic language. Pure stroke + current color, no hardcoded hex. */}
        <svg
          data-testid="flower-event-bubble-burst"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="text-accent h-6 w-6 shrink-0 fill-current"
          focusable="false"
        >
          <path d="M12 1 14.5 8.5 22 11l-7.5 2.5L12 22l-2.5-8.5L2 11l7.5-2.5z" />
        </svg>
        <span id={labelId} className="text-base font-semibold md:text-lg">
          {message}
        </span>
      </div>
    </motion.div>
  )
}

export default FlowerEventBubble