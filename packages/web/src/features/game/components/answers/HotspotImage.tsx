import clsx from "clsx"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { AnswerViewProps } from "./types"

export type PinPoint = { x: number; y: number }

export type HotspotImageProps = AnswerViewProps<PinPoint | null> & {
  imageUrl: string
  /** Reveal-only: correct zones */
  hotspots?: Array<{ x: number; y: number; w: number; h: number }>
  showZones?: boolean
}

/**
 * Drop-pin answer UI: image with one relative pin (0–1). Click/touch places pin.
 */
export function HotspotImage({
  value,
  onChange,
  onSubmit,
  disabled,
  feedback,
  testIdPrefix = "",
  imageUrl,
  hotspots,
  showZones = false,
}: HotspotImageProps) {
  const { t } = useTranslation()
  const isSolo = testIdPrefix === "solo-"
  const boxRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const place = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled || !boxRef.current) return
      const rect = boxRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      onChange({ x, y })
    },
    [disabled, onChange],
  )

  return (
    <div className="mx-auto mb-4 flex w-full max-w-4xl flex-col gap-3 px-4">
      <p className="text-center text-sm text-[color:var(--game-fg)]/70">
        {t("game:dropPin.clickImage", { defaultValue: "Place the pin" })}
      </p>
      <div
        ref={boxRef}
        role="img"
        aria-label={t("game:dropPin.prompt", {
          defaultValue: "Click the correct spot on the image",
        })}
        data-testid={isSolo ? "solo-hotspot-image" : "hotspot-image"}
        className={clsx(
          "relative aspect-video w-full cursor-crosshair overflow-hidden rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-black/5 shadow-[var(--shadow-flat)]",
          disabled && "cursor-not-allowed opacity-90",
        )}
        onClick={(e) => {
          if (disabled) return
          place(e.clientX, e.clientY)
        }}
        onPointerDown={(e) => {
          if (disabled) return
          setDragging(true)
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          place(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (!dragging || disabled) return
          place(e.clientX, e.clientY)
        }}
        onPointerUp={() => setDragging(false)}
      >
        <img
          src={imageUrl}
          alt=""
          className="pointer-events-none h-full w-full object-contain"
          draggable={false}
        />
        {showZones &&
          hotspots?.map((h, i) => (
            <div
              key={i}
              className="pointer-events-none absolute border-2 border-[var(--state-correct)] bg-[var(--state-correct)]/25"
              style={{
                left: `${h.x * 100}%`,
                top: `${h.y * 100}%`,
                width: `${h.w * 100}%`,
                height: `${h.h * 100}%`,
              }}
              data-testid={`hotspot-zone-${i}`}
            />
          ))}
        {value && (
          <div
            className={clsx(
              "pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
              feedback?.correct === true && "bg-[var(--state-correct)]",
              feedback?.correct === false && "bg-[var(--state-wrong)]",
              feedback == null && "bg-[var(--color-primary)]",
            )}
            style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }}
            data-testid={isSolo ? "solo-hotspot-pin" : "hotspot-pin"}
          />
        )}
      </div>
      <button
        type="button"
        disabled={disabled || !value}
        onClick={onSubmit}
        data-testid={isSolo ? "solo-hotspot-submit" : "hotspot-submit"}
        className={clsx(
          "mx-auto min-h-12 w-full max-w-sm rounded-[var(--radius-theme)] px-6 py-3 text-base font-semibold text-white",
          value && !disabled
            ? "bg-[var(--color-primary)]"
            : "cursor-not-allowed bg-[var(--color-primary)]/40",
        )}
      >
        {t("game:submitAnswer", { defaultValue: "Submit" })}
      </button>
    </div>
  )
}

export default HotspotImage
