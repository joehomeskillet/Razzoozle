import { ACHIEVEMENTS_REGISTRY, type AchievementId } from "@razzia/common/achievements"
import { EVENTS } from "@razzia/common/constants"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import {
  SectionCard,
  StickyActions,
} from "@razzia/web/features/manager/components/console"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { Award } from "lucide-react"
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
// Tier display config
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  bronze: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    label: "Bronze",
  },
  silver: {
    bg: "bg-gray-100",
    text: "text-gray-700",
    label: "Silber",
  },
  gold: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    label: "Gold",
  },
  diamant: {
    bg: "bg-sky-100",
    text: "text-sky-800",
    label: "Diamant",
  },
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
  state: RowState
  defaultName: string
  thresholdUnit?: string
  thresholdMin?: number
  thresholdMax?: number
  onChange: (id: AchievementId, patch: Partial<RowState>) => void
  t: ReturnType<typeof useTranslation>["t"]
}

const BadgeRow = ({
  id,
  state,
  defaultName,
  thresholdUnit,
  thresholdMin,
  thresholdMax,
  onChange,
  t,
}: BadgeRowProps) => {
  const hasThreshold =
    thresholdUnit !== undefined &&
    thresholdMin !== undefined &&
    thresholdMax !== undefined

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl px-4 py-3 outline-2 -outline-offset-2 transition-colors ${
        state.enabled
          ? "bg-gray-50 outline-gray-200"
          : "bg-gray-50/50 outline-gray-100 opacity-60"
      }`}
    >
      {/* Top bar: badge name + toggle */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-gray-800 text-sm">{defaultName}</span>
        <Toggle
          checked={state.enabled}
          onChange={(v) => onChange(id, { enabled: v })}
          label={t("manager:achievementsConfig.enabled")}
        />
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
            className={`${inputCls} w-28`}
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ConfigAchievements — manager tab to enable/disable badges and edit their
 * names, descriptions, and numeric thresholds. Initial values come from
 * useConfig().achievements (server-merged). Emits SET_ACHIEVEMENTS_CONFIG
 * with only the changed rows on save.
 */
const ConfigAchievements = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const config = useConfig()

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

  const handleSave = () => {
    // Collect all rows into a patch — server only stores overrides but we send
    // the full current state so a reset on the server side is also possible.
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
      const row = local[entry.id as AchievementId]
      configPatch[entry.id] = {
        enabled: row.enabled,
        name: row.name || undefined,
        description: row.description || undefined,
        threshold: row.threshold !== null ? row.threshold : undefined,
      }
    }

    socket.emit(EVENTS.MANAGER.SET_ACHIEVEMENTS_CONFIG, { config: configPatch })
    setSaved(true)
    toast.success(t("manager:achievementsConfig.saved"))
  }

  // Group by tier in display order
  const TIER_ORDER = ["bronze", "silver", "gold", "diamant"] as const

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SectionCard
        icon={<Award className="size-5" aria-hidden />}
        title={t("manager:achievementsConfig.title")}
        description={t("manager:achievementsConfig.hint")}
      >
        <div className="flex flex-col gap-5">
          {TIER_ORDER.map((tier) => {
            const tierEntries = ACHIEVEMENTS_REGISTRY.filter(
              (e) => e.tier === tier,
            )
            const colors = TIER_COLORS[tier]

            return (
              <div key={tier} className="flex flex-col gap-2">
                {/* Tier header chip */}
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text}`}
                  >
                    {colors.label}
                  </span>
                  <div className="flex-1 border-t border-gray-100" />
                </div>

                {/* Badge rows for this tier */}
                <div className="flex flex-col gap-2">
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
                        state={local[entry.id as AchievementId]}
                        defaultName={defaultName}
                        thresholdUnit={thresholdDef?.unit}
                        thresholdMin={thresholdDef?.min}
                        thresholdMax={thresholdDef?.max}
                        onChange={handleChange}
                        t={t}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <StickyActions>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
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
