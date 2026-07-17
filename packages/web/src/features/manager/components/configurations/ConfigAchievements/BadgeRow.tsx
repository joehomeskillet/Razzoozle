import { BONUS_MAX, type AchievementId } from "@razzoozle/common/achievements"
import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"
import Button from "@razzoozle/web/components/Button"
import NumberInput from "@razzoozle/web/components/NumberInput"
import { type AchievementTier } from "@razzoozle/web/features/game/utils/achievements"
import { type RowState } from "@razzoozle/web/features/manager/components/configurations/ConfigAchievements/types"
import { motion } from "motion/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

// ---------------------------------------------------------------------------
// Input style shared across rows
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink)] placeholder-[var(--ink-faint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"

// ---------------------------------------------------------------------------
// Achievement badge editor card
// ---------------------------------------------------------------------------

interface BadgeRowProps {
  id: AchievementId
  tier: AchievementTier
  state: RowState
  defaultName: string
  defaultDesc: string
  thresholdUnit?: string
  thresholdMin?: number
  thresholdMax?: number
  thresholdHint?: string
  onChange: (id: AchievementId, patch: Partial<RowState>) => void
  reduced: boolean
}

const BadgeRow = ({
  id,
  tier,
  state,
  defaultName,
  defaultDesc,
  thresholdUnit,
  thresholdMin,
  thresholdMax,
  thresholdHint,
  onChange,
  reduced,
}: BadgeRowProps) => {
  const { t } = useTranslation()
  const hasThreshold =
    thresholdUnit !== undefined &&
    thresholdMin !== undefined &&
    thresholdMax !== undefined

  // Draft string for the threshold input so the user can clear it while editing
  // (an empty string) without it snapping to min. Coerced + clamped on blur.
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null)

  const nameId = `ach-name-${id}`
  const descId = `ach-desc-${id}`
  const threshId = `ach-thresh-${id}`
  const bonusId = `ach-bonus-${id}`

  return (
    <motion.div
      layout={!reduced}
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: state.enabled ? 1 : 0.6, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`rounded-lg px-3 py-2.5 outline-2 -outline-offset-2 transition-colors ${
        state.enabled ? "bg-[var(--surface)] outline-[var(--line)]" : "bg-[var(--surface-2)] outline-[var(--line)]"
      }`}
    >
      {/* Header: medal + name/description + enable toggle */}
      <div className="flex items-center gap-2.5">
        <AchievementMedal id={id} tier={tier} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            {defaultName}
          </p>
          <p className="text-xs leading-snug text-[var(--ink-subtle)]">{defaultDesc}</p>
        </div>
        <Button
          type="button"
          role="switch"
          aria-checked={state.enabled}
          aria-label={t("manager:achievementsConfig.enabled")}
          onClick={() => onChange(id, { enabled: !state.enabled })}
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              state.enabled ? "bg-[var(--color-primary)]" : "bg-[var(--surface-5)]"
            }`}
          >
            <span
              className={`inline-block size-5 rounded-full bg-[var(--surface)] shadow transition-transform ${
                state.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </span>
        </Button>
      </div>

      {/* Compact name + description override inputs */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          id={nameId}
          type="text"
          className={inputCls}
          placeholder={defaultName}
          aria-label={t("manager:achievementsConfig.name")}
          value={state.name}
          onChange={(e) => onChange(id, { name: e.target.value })}
        />
        <input
          id={descId}
          type="text"
          className={inputCls}
          placeholder={defaultDesc || "—"}
          aria-label={t("manager:achievementsConfig.description")}
          value={state.description}
          onChange={(e) => onChange(id, { description: e.target.value })}
        />
      </div>

      {/* Threshold + explanation of what the value controls */}
      {hasThreshold && state.threshold !== null && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <NumberInput
              id={threshId}
              min={thresholdMin}
              max={thresholdMax}
              className="max-w-28 tabular-nums"
              aria-label={
                thresholdHint ?? t("manager:achievementsConfig.threshold")
              }
              value={thresholdDraft ?? String(state.threshold)}
              onChange={(e) => {
                // Keep whatever the user types (including an empty string) in the
                // draft; only commit/clamp on blur so clearing the field works.
                setThresholdDraft(e.target.value)
              }}
              onBlur={() => {
                if (thresholdDraft === null) {
                  return
                }
                const raw = Number(thresholdDraft)
                if (thresholdDraft.trim() !== "" && !Number.isNaN(raw)) {
                  onChange(id, {
                    threshold: Math.min(
                      Math.max(raw, thresholdMin!),
                      thresholdMax!,
                    ),
                  })
                }
                // Reset the draft so the committed (clamped) value shows.
                setThresholdDraft(null)
              }}
            />
            <span className="text-xs font-medium text-[var(--ink-subtle)]">
              {thresholdUnit}
            </span>
          </div>
          {thresholdHint && (
            <p className="mt-1 text-xs text-[var(--ink-subtle)]">{thresholdHint}</p>
          )}
        </div>
      )}

      {/* Bonus points awarded when the badge unlocks — shown for every badge */}
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <NumberInput
            id={bonusId}
            min={0}
            max={BONUS_MAX}
            className="max-w-28 tabular-nums"
            aria-label={t("manager:achievementsConfig.bonus")}
            value={state.bonus}
            onChange={(e) => {
              const raw = Number(e.target.value)
              if (!Number.isNaN(raw)) {
                onChange(id, {
                  bonus: Math.min(Math.max(raw, 0), BONUS_MAX),
                })
              }
            }}
          />
          <span className="text-xs font-medium text-[var(--ink-subtle)]">
            {t("manager:achievementsConfig.bonus")}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-subtle)]">
          {t("manager:achievementsConfig.bonusHint")}
        </p>
      </div>
    </motion.div>
  )
}

export default BadgeRow
