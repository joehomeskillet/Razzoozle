import clsx from "clsx"

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

/**
 * Kahoot-style circular countdown ring.
 *
 * A subtle background track plus a foreground accent ring that depletes from
 * full to empty as `seconds` runs down toward 0. The ring is driven purely by
 * `stroke-dasharray`/`stroke-dashoffset` — no spinning animation — and the
 * remaining seconds are shown centred (tabular, bold) so the timer never relies
 * on shape or colour alone (it always carries a readable number + aria-label).
 *
 * Motion: only an opacity/transform/stroke transition is used. Under
 * `prefers-reduced-motion` the stroke transition is dropped (the ring snaps to
 * each second instead of sweeping) while the number stays fully legible.
 *
 * Theme-agnostic: the foreground uses `var(--color-accent)` over a translucent
 * white track, so it reads correctly on both the flat (Suedhang) and glass
 * (Razzoozle) themes.
 */
const CircularTimer = ({ seconds, total, size = 88, className }: Props) => {
  // Clamp the displayed seconds and the fill fraction so a late/early tick or a
  // bad `total` (0/NaN) can never produce a negative offset or a NaN dash.
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0
  const fraction = safeTotal > 0 ? Math.min(1, safeSeconds / safeTotal) : 0
  // Full ring at fraction=1 (offset 0), empty at fraction=0 (offset = full ring).
  const dashOffset = CIRCUMFERENCE * (1 - fraction)

  const displaySeconds = Math.ceil(safeSeconds)

  return (
    <div
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={`${displaySeconds} ${
        displaySeconds === 1 ? "second" : "seconds"
      } remaining`}
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
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth={STROKE}
        />
        {/* Foreground depleting ring */}
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          // Smooth sweep between ticks; dropped under reduced motion so the ring
          // snaps per second instead of animating.
          className="transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none"
        />
      </svg>
      <span
        className="absolute font-bold tabular-nums text-white drop-shadow"
        style={{ fontSize: Math.max(14, Math.round(size * 0.34)) }}
        aria-hidden="true"
      >
        {displaySeconds}
      </span>
    </div>
  )
}

export default CircularTimer
