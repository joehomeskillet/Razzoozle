/**
 * TrophyGallery — shows all achievements grouped by tier.
 * Unlocked badges are shown as full-colour <AchievementMedal size="lg"> medallions
 * with a count badge. Locked badges are greyed/desaturated. Disabled achievements
 * (manager config) are hidden entirely.
 * Reads the {id: count} map persisted by Result.tsx in localStorage.
 * Prefers server-provided name/description overrides when available.
 */

import type { MergedAchievement } from "@razzoozle/common/achievements"
import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"
import {
  ACHIEVEMENT_META,
  TIER_GRADIENT,
  TIER_RING,
  TIER_TEXT,
  TIER_ORDER,
  getAchievementDisplay,
  loadAchievementMeta,
  type AchievementMeta,
  type AchievementTier,
} from "@razzoozle/web/features/game/utils/achievements"
import clsx from "clsx"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_KEY = "rahoot_achievements"

function readStoredAchievements(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// ─── Tier section ─────────────────────────────────────────────────────────────

interface TierSectionProps {
  tier: AchievementTier
  metas: AchievementMeta[]
  counts: Record<string, number>
  mergedList: MergedAchievement[]
}

const TierSection = ({ tier, metas, counts, mergedList }: TierSectionProps) => {
  const { t } = useTranslation()

  // Keep only enabled badges (treat absent merged entry as enabled)
  const visibleMetas = metas.filter((meta) => {
    const merged = mergedList.find((m) => m.id === meta.id)
    return merged === undefined || merged.enabled
  })

  if (visibleMetas.length === 0) return null

  const enabledCount = visibleMetas.length
  const unlockedCount = visibleMetas.filter((m) => (counts[m.id] ?? 0) > 0).length

  return (
    <section aria-label={t(`game:tier.${tier}`)} className="space-y-3">
      {/* Tier header pill */}
      <div className="flex items-center gap-2">
        <h3
          className={clsx(
            "inline-block rounded-full bg-gradient-to-r px-3 py-0.5 text-xs font-bold uppercase tracking-widest",
            TIER_GRADIENT[tier],
            TIER_TEXT[tier],
          )}
        >
          {t(`game:tier.${tier}`)}
        </h3>
        <span className="rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--color-field-ink)]/60">
          {unlockedCount} / {enabledCount}
        </span>
      </div>

      {/* Badge grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
                "relative flex flex-col items-center gap-2 rounded-2xl px-3 py-4 transition-opacity",
                unlocked
                  ? `bg-gradient-to-br ring-2 shadow-lg ${TIER_GRADIENT[tier]} ${TIER_RING[tier]}`
                  : "bg-gray-200 opacity-50 grayscale ring-1 ring-gray-300",
              )}
              aria-label={`${display.name}${unlocked ? `, ${count}×` : `, ${t("game:locked")}`}`}
            >
              {/* Medallion — full colour when unlocked, inherits grayscale from parent when locked */}
              <AchievementMedal
                id={meta.id}
                tier={tier}
                size="lg"
                pulse={unlocked && (tier === "gold" || tier === "diamant")}
              />

              {/* Badge name */}
              <p
                className={clsx(
                  "text-center text-xs font-bold leading-tight",
                  unlocked ? TIER_TEXT[tier] : "text-[color:var(--color-field-ink)]/70",
                )}
              >
                {display.name}
              </p>

              {/* Description — truncated to one line */}
              <p
                className={clsx(
                  "line-clamp-2 text-center text-[10px] leading-snug",
                  unlocked ? `${TIER_TEXT[tier]} opacity-75` : "text-[color:var(--color-field-ink)]/50",
                )}
              >
                {display.description}
              </p>

              {/* Count badge — shown when unlocked (always show ×count) */}
              {unlocked && (
                <span
                  className={clsx(
                    "absolute right-2 top-2 rounded-full bg-[#2B2B33] px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums",
                    TIER_TEXT[tier],
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

// ─── Gallery ─────────────────────────────────────────────────────────────────

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

  // Derive enabled badge ids (from merged list or fall back to all)
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
      className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6"
    >
      <header className="flex items-baseline gap-3">
        <h2 className="text-2xl font-extrabold text-[color:var(--color-field-ink)]">
          {t("game:achievements.gallery.title", "Trophäen")}
        </h2>
        <span className="rounded-full bg-[#F4F1EA] px-2 py-0.5 text-xs tabular-nums text-[color:var(--color-field-ink)]/60">
          {totalUnlocked} / {enabledIds.size}
        </span>
      </header>

      {totalUnlocked === 0 && (
        <p className="text-sm text-[color:var(--color-field-ink)]/70">
          {t(
            "game:achievements.gallery.empty",
            "Noch keine Trophäen — spiel eine Runde, um deine erste zu verdienen.",
          )}
        </p>
      )}

      {/* Tiers from lowest to highest; disabled badges are hidden inside TierSection */}
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
