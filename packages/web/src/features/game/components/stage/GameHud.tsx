import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useGameAudience } from "@razzoozle/web/features/game/audience"

export interface GameHudProps {
  timer?: ReactNode
  answered?: number
  total?: number
  submitted?: boolean
}

export function GameHud({
  timer,
  answered,
  total,
  submitted,
}: GameHudProps): ReactNode {
  const { t } = useTranslation()
  const audience = useGameAudience()

  // Audience-aware layout: presenter/display uses horizontal large digits,
  // player uses compact row layout.
  const isCompact = audience === "player"

  return (
    <div
      className={`mx-auto w-full max-w-7xl px-2 lg:max-w-[85vw] ${
        isCompact
          ? "flex items-center justify-between gap-[var(--game-space-4)] text-lg font-bold text-[color:var(--game-fg)] md:text-xl"
          : "flex items-center justify-between gap-[var(--game-space-6)] text-2xl font-bold text-[color:var(--game-fg)] md:text-3xl lg:text-[clamp(1.5rem,3vh,2.5rem)]"
      }`}
      role="status"
    >
      {/* Timer slot */}
      {timer && (
        <div className="flex flex-col items-center gap-[var(--game-space-2)]">
          <span className="text-sm text-[color:var(--game-fg)]/70">
            {t("game:hud.time")}
          </span>
          <div>
            {timer}
          </div>
        </div>
      )}

      {/* Answered/Total counter — visually coupled */}
      {typeof answered === "number" && typeof total === "number" && (
        <div className="flex flex-col items-center rounded-lg bg-white px-4 py-2 text-[color:var(--color-field-ink)] border border-[var(--border-hairline)] shadow-sm">
          <span className="text-sm text-[color:var(--color-field-ink)]/70">
            {t("game:hud.answers")}
          </span>
          <span className="tabular-nums">{answered}/{total}</span>
        </div>
      )}

      {/* Submitted confirmation pill (appears after answer lock-in) */}
      {submitted && (
        <div className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-bold text-[color:var(--color-field-ink)] border border-[var(--border-hairline)] shadow-sm">
          {t("game:hud.answerSaved")}
        </div>
      )}
    </div>
  )
}
