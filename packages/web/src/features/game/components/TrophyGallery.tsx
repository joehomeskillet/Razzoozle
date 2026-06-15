import type { MergedAchievement } from "@razzia/common/achievements"
import {
  ACHIEVEMENT_META,
  TIER_ORDER,
  TIER_STYLES,
  getAchievementDisplay,
  loadAchievementMeta,
  type AchievementMeta,
  type AchievementTier,
} from "@razzia/web/features/game/utils/achievements"
import clsx from "clsx"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

const LS_KEY = "rahoot_achievements"

function readStoredAchievements(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

interface TierSectionProps {
  tier: AchievementTier
  metas: AchievementMeta[]
  counts: Record<string, number>
  mergedList: MergedAchievement[]
}

const TierSection = ({ tier, metas, counts, mergedList }: TierSectionProps) => {
  const { t } = useTranslation()
  const style = TIER_STYLES[tier]

  // Filter to only metas that are enabled (or have no merged entry = default enabled)
  const visibleMetas = metas.filter((meta) => {
    const merged = mergedList.find((m) => m.id === meta.id)
    // If no merged data yet (e.g. fetch failed), treat as enabled
    return merged === undefined || merged.enabled
  })

  if (visibleMetas.length === 0) return null

  return (
    <section aria-label={style.label} className="space-y-2">
      <h3
        className={clsx(
          "inline-block rounded-full bg-gradient-to-r px-3 py-0.5 text-xs font-bold uppercase tracking-widest",
          style.gradient,
          style.textColor,
        )}
      >
        {style.label}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {visibleMetas.map((meta) => {
          const count = counts[meta.id] ?? 0
          const unlocked = count > 0
          const merged = mergedList.find((m) => m.id === meta.id)
          const display = getAchievementDisplay(meta.id, merged, {
            name: t(`game:achievements.${meta.id}.name`, meta.id),
            desc: t(`game:achievements.${meta.id}.desc`, ""),
          })

          return (
            <div
              key={meta.id}
              className={clsx(
                "flex items-center gap-3 rounded-xl border px-3 py-2 transition-opacity",
                unlocked
                  ? `bg-gradient-to-r ring-1 ${style.gradient} ${style.ringColor} border-transparent shadow-md`
                  : "border-white/10 bg-white/5 opacity-40 grayscale",
              )}
              aria-label={`${display.name}${unlocked ? `, ${count}×` : ""}`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={clsx(
                    "truncate text-sm font-bold leading-tight",
                    unlocked ? style.textColor : "text-white/60",
                  )}
                >
                  {display.name}
                </p>
                <p
                  className={clsx(
                    "truncate text-xs leading-snug",
                    unlocked ? `${style.textColor} opacity-80` : "text-white/40",
                  )}
                >
                  {display.description}
                </p>
              </div>
              {unlocked && count > 1 && (
                <span
                  className={clsx(
                    "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold",
                    style.textColor,
                    "bg-black/20",
                  )}
                  aria-hidden
                >
                  ×{count}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Trophy Gallery — shows all achievements grouped by tier.
 * Unlocked achievements are shown in full color; locked ones are greyed out.
 * Disabled achievements (manager config) are hidden entirely.
 * Reads the {id: count} map persisted by Result.tsx in localStorage.
 * Prefers server-provided name/description overrides when available.
 */
const TrophyGallery = () => {
  const { t } = useTranslation()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [mergedList, setMergedList] = useState<MergedAchievement[]>([])

  useEffect(() => {
    setCounts(readStoredAchievements())
  }, [])

  useEffect(() => {
    loadAchievementMeta().then((list) => {
      if (list.length > 0) setMergedList(list)
    })
  }, [])

  // Derive total enabled badge count (from merged list or fallback to all 15)
  const enabledIds: Set<string> =
    mergedList.length > 0
      ? new Set(mergedList.filter((m) => m.enabled).map((m) => m.id))
      : new Set(Object.keys(ACHIEVEMENT_META))

  const totalUnlocked = Object.entries(counts).reduce(
    (sum, [id, c]) => sum + (c > 0 && enabledIds.has(id) ? 1 : 0),
    0,
  )

  // Group metas by tier
  const byTier: Record<AchievementTier, AchievementMeta[]> = {
    bronze: [],
    silver: [],
    gold: [],
    diamant: [],
  }
  for (const meta of Object.values(ACHIEVEMENT_META)) {
    byTier[meta.tier].push(meta)
  }

  return (
    <section
      aria-label={t("game:achievements.gallery.title", "Trophäen")}
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6"
    >
      <header className="flex items-baseline gap-3">
        <h2 className="text-2xl font-extrabold text-white drop-shadow">
          {t("game:achievements.gallery.title", "Trophäen")}
        </h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
          {totalUnlocked} / {enabledIds.size}
        </span>
      </header>

      {totalUnlocked === 0 && (
        <p className="text-sm text-white/50">
          {t(
            "game:achievements.gallery.empty",
            "Noch keine Trophäen — spiel eine Runde, um deine erste zu verdienen.",
          )}
        </p>
      )}

      {/* Render tiers from lowest to highest; disabled badges are hidden */}
      {TIER_ORDER.map((tier) => (
        <TierSection
          key={tier}
          tier={tier}
          metas={byTier[tier]}
          counts={counts}
          mergedList={mergedList}
        />
      ))}
    </section>
  )
}

export default TrophyGallery
