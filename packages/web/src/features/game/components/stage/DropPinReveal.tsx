import clsx from "clsx"
import type { ReactNode } from "react"

export type DropPinZone = { x: number; y: number; w: number; h: number }
export type DropPinPoint = { x: number; y: number }

export type DropPinRevealProps = {
  imageUrl: string
  /** relative 0–1 rects; if empty, only image + label */
  hotspots?: DropPinZone[]
  /** highlight index; default show all zones when provided */
  correctHotspotIndex?: number | null
  /** player pin 0–1; omit for presenter-only */
  playerPin?: DropPinPoint | null
  title?: string
  className?: string
}

function isInside(pin: DropPinPoint, zone: DropPinZone): boolean {
  return (
    pin.x >= zone.x &&
    pin.x <= zone.x + zone.w &&
    pin.y >= zone.y &&
    pin.y <= zone.y + zone.h
  )
}

/**
 * Reusable drop-pin reveal visual (presenter + player): theme-framed image with
 * the correct hotspot zone(s) highlighted and an optional player pin overlay.
 * Purely presentational — wiring into Result/Responses happens separately.
 */
export function DropPinReveal({
  imageUrl,
  hotspots,
  correctHotspotIndex = null,
  playerPin = null,
  title,
  className,
}: DropPinRevealProps): ReactNode {
  // A valid correctHotspotIndex highlights that single zone; otherwise every
  // provided zone is shown.
  const zones: Array<DropPinZone & { index: number }> =
    typeof correctHotspotIndex === "number" && hotspots?.[correctHotspotIndex]
      ? [{ ...hotspots[correctHotspotIndex], index: correctHotspotIndex }]
      : (hotspots ?? []).map((zone, index) => ({ ...zone, index }))

  // Pin tone: with zones, correct (green) when the pin landed inside a shown
  // zone, wrong (red) otherwise; without any zone concept the pin is neutral
  // green — there is nothing to be wrong against.
  const pinCorrect =
    playerPin != null && zones.length > 0
      ? zones.some((zone) => isInside(playerPin, zone))
      : null

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-4xl flex-col gap-3",
        className,
      )}
      data-testid="drop-pin-reveal"
    >
      {title && (
        <p className="text-center text-sm font-medium text-[color:var(--game-fg)]">
          {title}
        </p>
      )}
      <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] shadow-[var(--shadow-flat)]">
        <img
          src={imageUrl}
          alt=""
          className="pointer-events-none h-full w-full object-contain"
          draggable={false}
        />
        {zones.map((zone) => (
          <div
            key={zone.index}
            className="pointer-events-none absolute border-2 border-[var(--state-correct)] bg-[var(--state-correct)]/25"
            style={{
              left: `${zone.x * 100}%`,
              top: `${zone.y * 100}%`,
              width: `${zone.w * 100}%`,
              height: `${zone.h * 100}%`,
            }}
            data-testid={`drop-pin-reveal-zone-${zone.index}`}
          />
        ))}
        {playerPin && (
          <div
            className={clsx(
              "pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--answer-text)] shadow",
              pinCorrect === false
                ? "bg-[var(--state-wrong)]"
                : "bg-[var(--state-correct)]",
            )}
            style={{
              left: `${playerPin.x * 100}%`,
              top: `${playerPin.y * 100}%`,
            }}
            data-testid="drop-pin-reveal-pin"
          />
        )}
      </div>
    </div>
  )
}
