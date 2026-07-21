import {
  TIER_GRADIENT,
  TIER_RING,
  TIER_TEXT,
  type AchievementTier,
} from "@razzoozle/web/features/game/utils/achievements"
import Badge from "@razzoozle/web/components/manager/Badge"
import { useTranslation } from "react-i18next"
import clsx from "clsx"

// ---------------------------------------------------------------------------
// Tier section header — gradient pill with label + enabled-count badge
// ---------------------------------------------------------------------------

interface TierHeaderProps {
  tier: AchievementTier
  enabledCount: number
  totalCount: number
}

const TierHeader = ({ tier, enabledCount, totalCount }: TierHeaderProps) => {
  const { t } = useTranslation()
  const label = t(`game:tier.${tier}`)
  const gradient = TIER_GRADIENT[tier]
  const textCls = TIER_TEXT[tier]
  const ringCls = TIER_RING[tier]

  return (
    <div className="flex items-center gap-3">
      {/* Gradient pill — layers gradient + text + ring on chipBase structure */}
      <Badge
        className={clsx(
          "bg-gradient-to-r px-3 py-1 font-bold tracking-wide ring-2",
          gradient,
          textCls,
          ringCls,
        )}
      >
        {label}
      </Badge>
      {/* Enabled count */}
      <span className="tabular-nums text-xs font-semibold text-[var(--ink-subtle)]">
        {enabledCount}/{totalCount}{" "}
        {t("manager:achievements.active", { defaultValue: "aktiv" })}
      </span>
      <div className="flex-1 border-t border-[var(--line)]" />
    </div>
  )
}

export default TierHeader
