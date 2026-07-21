import {
  ACHIEVEMENTS_REGISTRY,
  TIER_BONUS_DEFAULT,
  type AchievementId,
} from "@razzoozle/common/achievements"
import { EVENTS } from "@razzoozle/common/constants"
import { TIER_ORDER } from "@razzoozle/web/features/game/utils/achievements"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { SectionCard } from "@razzoozle/web/features/manager/components/console"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import BadgeRow from "@razzoozle/web/features/manager/components/configurations/ConfigAchievements/BadgeRow"
import TierHeader from "@razzoozle/web/features/manager/components/configurations/ConfigAchievements/TierHeader"
import {
  EMPTY_ROW,
  THRESHOLD_HINTS,
  type LocalState,
  type RowState,
} from "@razzoozle/web/features/manager/components/configurations/ConfigAchievements/types"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { ActionFooter } from "@razzoozle/web/components/ui"
import Button from "@razzoozle/web/components/Button"
import { Award, RotateCcw } from "lucide-react"
import { AnimatePresence, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

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
        bonus: served?.bonus ?? TIER_BONUS_DEFAULT[entry.tier],
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
        bonus: TIER_BONUS_DEFAULT[entry.tier],
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
        bonus?: number
      }
    > = {}
    for (const entry of ACHIEVEMENTS_REGISTRY) {
      const row = state[entry.id as AchievementId]
      configPatch[entry.id] = {
        enabled: row.enabled,
        name: row.name || undefined,
        description: row.description || undefined,
        threshold: row.threshold !== null ? row.threshold : undefined,
        bonus: row.bonus,
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
    <>
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <PageHeader
          title={t("manager:achievementsConfig.title")}
          subtitle={t("manager:achievementsConfig.hint")}
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 pb-20">
      <SectionCard
        icon={<Award className="size-5" aria-hidden />}
        title={t("manager:achievementsConfig.title")}
        description={t("manager:achievementsConfig.hint")}
      >
        {/* Extra bottom padding so last badge card isn't hidden behind ActionFooter */}
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

                {/* Badge editor cards for this tier */}
                <div className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {tierEntries.map((entry) => {
                      const thresholdDef =
                        "threshold" in entry ? entry.threshold : undefined
                      const defaultName = t(
                        `game:achievements.${entry.id}.name`,
                        { defaultValue: entry.id },
                      )
                      const defaultDesc = t(
                        `game:achievements.${entry.id}.desc`,
                        { defaultValue: "" },
                      )
                      const thresholdHint = thresholdDef
                        ? t(
                            `manager:achievementsConfig.thresholdHint.${thresholdDef.key}`,
                            {
                              defaultValue:
                                THRESHOLD_HINTS[thresholdDef.key] ?? "",
                            },
                          )
                        : undefined
                      return (
                        <BadgeRow
                          key={entry.id}
                          id={entry.id as AchievementId}
                          tier={tier}
                          state={local[entry.id as AchievementId] ?? EMPTY_ROW}
                          defaultName={defaultName}
                          defaultDesc={defaultDesc}
                          thresholdUnit={thresholdDef?.unit}
                          thresholdMin={thresholdDef?.min}
                          thresholdMax={thresholdDef?.max}
                          thresholdHint={thresholdHint}
                          onChange={handleChange}
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

      </SectionCard>
      </div>

      <ActionFooter>
        <Button
          variant="secondary"
          type="button"
          onClick={handleReset}
          className="rounded-[var(--radius-theme)]"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("manager:achievementsConfig.reset", {
            defaultValue: "Auf Standard zurücksetzen",
          })}
        </Button>
        <Button
          variant="primary"
          type="button"
          className="flex-1 rounded-[var(--radius-theme)] sm:flex-none"
          onClick={handleSave}
        >
          {saved
            ? t("manager:achievementsConfig.saved")
            : t("manager:achievementsConfig.save")}
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigAchievements
