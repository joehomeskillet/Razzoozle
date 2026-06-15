import { ACHIEVEMENTS_REGISTRY, type AchievementId } from "@razzia/common/achievements"
import { EVENTS } from "@razzia/common/constants"
import AchievementMedal from "@razzia/web/features/game/components/AchievementMedal"
import {
  TIER_GRADIENT,
  TIER_LABEL,
  TIER_ORDER,
  TIER_RING,
  TIER_TEXT,
  type AchievementTier,
} from "@razzia/web/features/game/utils/achievements"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import {
  SectionCard,
  StickyActions,
} from "@razzia/web/features/manager/components/console"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { Award } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// ---------------------------------------------------------------------------
// Local state types
// ---------------------------------------------------------------------------

interface RowState {
  enabled: boolean
  name: string
  description: string
  threshold: number | null
}

type LocalState = Record<AchievementId, RowState>

// ---------------------------------------------------------------------------
// Tier section header — gradient strip with label + enabled-count badge
// ---------------------------------------------------------------------------

interface TierHeaderProps {
  tier: AchievementTier
  enabledCount: number
  totalCount: number
}

const TierHeader = ({ tier, enabledCount, totalCount }: TierHeaderProps) => {
  const label = TIER_LABEL[tier]
  const gradient = TIER_GRADIENT[tier]
  const textCls = TIER_TEXT[tier]
  const ringCls = TIER_RING[tier]

  return (
    <div className="flex items-center gap-3">
      {/* Gradient pill */}
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold tracking-wide ring-2 ${gradient} ${textCls} ${ringCls}`}
      >
        {label}
      </span>
      {/* Enabled count */}
      <span className="tabular-nums text-xs font-semibold text-gray-500">
        {enabledCount}/{totalCount} aktiv
      </span>
      <div className="flex-1 border-t border-gray-100" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch (same visual language as ConfigGameMode)
// ---------------------------------------------------------------------------

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}

const Toggle = ({ checked, onChange, label }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
      checked ? "bg-[var(--color-primary)]" : "bg-gray-300"
    }`}
  >
    <span
      className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </button>
)

// ---------------------------------------------------------------------------
// Input style shared across rows
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"

// ---------------------------------------------------------------------------
// Achievement badge row
// ---------------------------------------------------------------------------

interface BadgeRowProps {
  id: AchievementId
  tier: AchievementTier
  state: RowState
  defaultName: string
  thresholdUnit?: string
  thresholdMin?: number
  thresholdMax?: number
  onChange: (id: AchievementId, patch: Partial<RowState>) => void
  t: ReturnType<typeof useTranslation>["t"]
  reduced: boolean
}

const BadgeRow = ({
  id,
  tier,
  state,
  defaultName,
  thresholdUnit,
  thresholdMin,
  thresholdMax,
  onChange,
  t,
  reduced,
}: BadgeRowProps) => {
  const hasThreshold =
    thresholdUnit !== undefined &&
    thresholdMin !== undefined &&
    thresholdMax !== undefined

  return (
    <motion.div
      layout={!reduced}
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: state.enabled ? 1 : 0.55, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`flex flex-col gap-3 rounded-xl px-4 py-3 ring-1 transition-colors ${
        state.enabled
          ? "bg-gray-50 ring-gray-200"
          : "bg-gray-50/50 ring-gray-100"
      }`}
    >
      {/* Top bar: medal preview + badge name + toggle */}
      <div className="flex items-center gap-3">
        {/* Medal icon — min touch 44px via padding wrapper */}
        <span className="flex shrink-0 items-center justify-center">
          <AchievementMedal id={id} tier={tier} size="md" />
        </span>

        {/* Name + toggle */}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="truncate font-semibold text-gray-800 text-sm">
            {defaultName}
          </span>
          <Toggle
            checked={state.enabled}
            onChange={(v) => onChange(id, { enabled: v })}
            label={t("manager:achievementsConfig.enabled")}
          />
        </div>
      </div>

      {/* Editable fields — always visible so the manager can pre-configure */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("manager:achievementsConfig.name")}
          </label>
          <input
            type="text"
            className={inputCls}
            placeholder={defaultName}
            value={state.name}
            onChange={(e) => onChange(id, { name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("manager:achievementsConfig.description")}
          </label>
          <input
            type="text"
            className={inputCls}
            placeholder="—"
            value={state.description}
            onChange={(e) => onChange(id, { description: e.target.value })}
          />
        </div>
      </div>

      {/* Threshold input — only for badges that have one */}
      {hasThreshold && state.threshold !== null && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 shrink-0">
            {t("manager:achievementsConfig.threshold")}
          </label>
          <input
            type="number"
            min={thresholdMin}
            max={thresholdMax}
            className={`${inputCls} w-28 tabular-nums`}
            value={state.threshold}
            onChange={(e) => {
              const raw = Number(e.target.value)
              if (!Number.isNaN(raw)) {
                onChange(id, {
                  threshold: Math.min(
                    Math.max(raw, thresholdMin!),
                    thresholdMax!,
                  ),
                })
              }
            }}
          />
          <span className="text-sm text-gray-500">{thresholdUnit}</span>
        </div>
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ConfigAchievements — manager tab to enable/disable badges and edit their
 * names, descriptions, and numeric thresholds. Initial values come from
 * useConfig().achievements (server-merged). Emits SET_ACHIEVEMENTS_CONFIG
 * with the full current state on save. "Auf Standard zurücksetzen" resets
 * all rows to registry defaults and emits that as well.
 */
const ConfigAchievements = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const config = useConfig()
  const reduced = useReducedMotion() ?? false

  // Build initial local state from server config or ACHIEVEMENTS_REGISTRY defaults
  const buildInitial = (): LocalState => {
    const result = {} as LocalState
    for (const entry of ACHIEVEMENTS_REGISTRY) {
      const served = config.achievements?.find((a) => a.id === entry.id)
      const thresholdDef = "threshold" in entry ? entry.threshold : undefined
      result[entry.id as AchievementId] = {
        enabled: served?.enabled ?? true,
        name: served?.name ?? "",
        description: served?.description ?? "",
        threshold:
          thresholdDef !== undefined
            ? (served?.threshold ?? thresholdDef.default)
            : null,
      }
    }
    return result
  }

  /** Registry defaults — used by "Auf Standard zurücksetzen" */
  const buildDefaults = (): LocalState => {
    const result = {} as LocalState
    for (const entry of ACHIEVEMENTS_REGISTRY) {
      const thresholdDef = "threshold" in entry ? entry.threshold : undefined
      result[entry.id as AchievementId] = {
        enabled: true,
        name: "",
        description: "",
        threshold: thresholdDef !== undefined ? thresholdDef.default : null,
      }
    }
    return result
  }

  const [local, setLocal] = useState<LocalState>(buildInitial)
  const [saved, setSaved] = useState(false)

  // Re-sync when server emits fresh config (emitConfig round-trip after save)
  useEffect(() => {
    setLocal(buildInitial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.achievements])

  const handleChange = (id: AchievementId, patch: Partial<RowState>) => {
    setLocal((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
    setSaved(false)
  }

  const buildConfigPatch = (state: LocalState) => {
    const configPatch: Record<
      string,
      {
        enabled?: boolean
        name?: string
        description?: string
        threshold?: number
      }
    > = {}
    for (const entry of ACHIEVEMENTS_REGISTRY) {
      const row = state[entry.id as AchievementId]
      configPatch[entry.id] = {
        enabled: row.enabled,
        name: row.name || undefined,
        description: row.description || undefined,
        threshold: row.threshold !== null ? row.threshold : undefined,
      }
    }
    return configPatch
  }

  const handleSave = () => {
    socket.emit(EVENTS.MANAGER.SET_ACHIEVEMENTS_CONFIG, {
      config: buildConfigPatch(local),
    })
    setSaved(true)
    toast.success(t("manager:achievementsConfig.saved"))
  }

  const handleReset = () => {
    const defaults = buildDefaults()
    setLocal(defaults)
    setSaved(false)
    socket.emit(EVENTS.MANAGER.SET_ACHIEVEMENTS_CONFIG, {
      config: buildConfigPatch(defaults),
    })
    toast.success(
      t("manager:achievementsConfig.resetDone", {
        defaultValue: "Auf Standard zurückgesetzt",
      }),
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SectionCard
        icon={<Award className="size-5" aria-hidden />}
        title={t("manager:achievementsConfig.title")}
        description={t("manager:achievementsConfig.hint")}
      >
        <div className="flex flex-col gap-6">
          {TIER_ORDER.map((tier) => {
            const tierEntries = ACHIEVEMENTS_REGISTRY.filter(
              (e) => e.tier === tier,
            )
            const enabledCount = tierEntries.filter(
              (e) => local[e.id as AchievementId]?.enabled,
            ).length

            return (
              <div key={tier} className="flex flex-col gap-3">
                {/* Tier section header */}
                <TierHeader
                  tier={tier}
                  enabledCount={enabledCount}
                  totalCount={tierEntries.length}
                />

                {/* Badge rows for this tier */}
                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {tierEntries.map((entry) => {
                      const thresholdDef =
                        "threshold" in entry ? entry.threshold : undefined
                      const defaultName = t(
                        `game:achievements.${entry.id}.name`,
                        { defaultValue: entry.id },
                      )
                      return (
                        <BadgeRow
                          key={entry.id}
                          id={entry.id as AchievementId}
                          tier={tier}
                          state={local[entry.id as AchievementId]}
                          defaultName={defaultName}
                          thresholdUnit={thresholdDef?.unit}
                          thresholdMin={thresholdDef?.min}
                          thresholdMax={thresholdDef?.max}
                          onChange={handleChange}
                          t={t}
                          reduced={reduced}
                        />
                      )
                    })}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}
        </div>

        <StickyActions>
          {/* Reset button */}
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            {t("manager:achievementsConfig.reset", {
              defaultValue: "Auf Standard zurücksetzen",
            })}
          </button>

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[44px] rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            {saved
              ? t("manager:achievementsConfig.saved")
              : t("manager:achievementsConfig.save")}
          </button>
        </StickyActions>
      </SectionCard>
    </div>
  )
}

export default ConfigAchievements
