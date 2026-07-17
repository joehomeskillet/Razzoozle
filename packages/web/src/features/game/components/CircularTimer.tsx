import clsx from "clsx"
import { useTranslation } from "react-i18next"

interface Props {
  /** Remaining whole seconds to display in the centre and drive the ring. */
  seconds: number
  /** The question's total time, i.e. the value `seconds` started from. */
  total: number
  /** Pixel size of the SVG square. Defaults to 88. Overridable per call-site. */
  size?: number
  /** Extra classes for the wrapping element (e.g. responsive sizing). */
  className?: string
}

// Geometry is expressed in a fixed 100×100 viewBox so the ring scales purely via
// the SVG `width`/`height`; stroke width stays proportional at any rendered size.
const VIEWBOX = 100
const STROKE = 9
const RADIUS = (VIEWBOX - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Below this remaining fraction the timer enters its "urgent" state: the ring +
// number shift to a warning red and (motion permitting) breathe with a pulse.
const URGENT_FRACTION = 0.25
// Theme-agnostic urgency colour. Reads on the flat cream theme; not tied to
// `--color-accent` so the shift is unmistakable.
const URGENT_STROKE = "var(--timer-urgent)"

/**
 * Kahoot-style circular countdown ring.
 *
 * A subtle background track plus a foreground accent ring that depletes from
 * full to empty as `seconds` runs down toward 0. The ring is driven purely by
 * `stroke-dasharray`/`stroke-dashoffset` — no spinning animation — and the
 * remaining seconds are shown centred (tabular, bold) so the timer never relies
 * on shape or colour alone (it always carries a readable number + aria-label).
 *
 * Urgency: in the final ~25% of the question's time the ring + number shift from
 * the accent colour to a warning red and the whole dial pulses. The pulse is a
 * pure CSS opacity breathe (`animate-pulse`) — no layout, no spring — so it stays
 * cheap even with the per-tick re-render firehose of a ~200-player room.
 *
 * Motion: only opacity/transform/stroke transitions are used. Under
 * `prefers-reduced-motion` the stroke transition is dropped (the ring snaps to
 * each second) and the urgency pulse is suppressed (`motion-reduce:animate-none`)
 * — but the colour shift remains, so the warning is never lost.
 *
 * Theme-agnostic: the foreground uses `var(--color-accent)` over a translucent
 * white track, so it reads correctly on the flat cream theme.
 */
const CircularTimer = ({ seconds, total, size = 88, className }: Props) => {
  const { t } = useTranslation()
  // Clamp the displayed seconds and the fill fraction so a late/early tick or a
  // bad `total` (0/NaN) can never produce a negative offset or a NaN dash.
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0
  const safeSeconds = Number.isFinite(seconds)
    ? safeTotal > 0
      ? Math.min(safeTotal, Math.max(0, seconds))
      : Math.max(0, seconds)
    : 0
  const fraction = safeTotal > 0 ? Math.min(1, safeSeconds / safeTotal) : 0
  // Full ring at fraction=1 (offset 0), empty at fraction=0 (offset = full ring).
  const dashOffset = CIRCUMFERENCE * (1 - fraction)

  const displaySeconds = Math.ceil(safeSeconds)

  // Urgent once we drop into the final quarter of the run, but only while time
  // actually remains (fraction === 0 is "done", not "urgent").
  const isUrgent = fraction > 0 && fraction <= URGENT_FRACTION
  const ringStroke = isUrgent ? URGENT_STROKE : "var(--color-accent)"

  return (
    <div
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center",
        // Pulse only while urgent; a pure opacity breathe (no layout/spring).
        // Suppressed under reduced motion — the colour shift below stays.
        isUrgent && "animate-pulse motion-reduce:animate-none",
        className,
      )}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={t("game:timer.remaining", { count: displaySeconds })}
    >
      <svg
        className="h-full w-full -rotate-90"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* Background track */}
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--timer-track)"
          strokeWidth={STROKE}
        />
        {/* Foreground depleting ring */}
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke={ringStroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          // Smooth sweep between ticks plus a cheap colour cross-fade into the
          // urgent state; both dropped under reduced motion so the ring snaps
          // per second and the colour swaps instantly.
          className="transition-[stroke-dashoffset,stroke] duration-300 ease-linear motion-reduce:transition-none"
        />
      </svg>
      <span
        className={clsx(
          "absolute font-bold tabular-nums drop-shadow",
          // Number tracks the ring colour for a redundant (non-colour-only)
          // urgency cue; instant under reduced motion via the global rule.
          isUrgent ? "text-[var(--timer-urgent)]" : "text-[color:var(--game-fg)]",
          "transition-colors duration-300 motion-reduce:transition-none",
        )}
        style={{ fontSize: Math.max(14, Math.round(size * 0.34)) }}
        aria-hidden="true"
      >
        {displaySeconds}
      </span>
    </div>
  )
}

export default CircularTimer
