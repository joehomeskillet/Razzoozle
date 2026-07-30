import { useTranslation } from "react-i18next"

import type { FlowerBattleActiveEffect } from "./FlowerBattlePlayerStatus"

export interface FlowerPowerupStatusIconsProps {
  activeEffects: FlowerBattleActiveEffect[]
}

/**
 * FlowerPowerupStatusIcons — pure presenter for active flower-battle power-up
 * status lines (icon + visible text, never icon-only). Returns null when no
 * effect is active. Fertilizer is intentionally omitted (instant effect, no
 * persistent status).
 *
 * WP947 / WP-FLB-13
 */
export function FlowerPowerupStatusIcons({
  activeEffects,
}: FlowerPowerupStatusIconsProps) {
  const { t } = useTranslation("game")

  if (activeEffects.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1" data-testid="flower-powerup-status-icons">
      {activeEffects.includes("umbrella_shield") && (
        <p
          data-testid="flower-powerup-status-umbrella-shield"
          className="text-xs text-ink-subtle"
        >
          {t("flowerBattlePlayerStatus.effect.umbrellaShield", {
            defaultValue: "☂ Schutz aktiv",
          })}
        </p>
      )}
      {activeEffects.includes("acid_rain") && (
        <p
          data-testid="flower-powerup-status-acid-rain"
          className="text-xs text-ink-subtle"
        >
          {t("flowerBattlePlayerStatus.effect.acidRain", {
            defaultValue: "☁ Nächstes Wachstum −1",
          })}
        </p>
      )}
      {activeEffects.includes("sunbeam") && (
        <p data-testid="flower-powerup-status-sunbeam" className="text-xs text-ink-subtle">
          {t("flowerBattlePlayerStatus.effect.sunbeam", {
            defaultValue: "☀ Nächstes Wachstum +1",
          })}
        </p>
      )}
    </div>
  )
}

export default FlowerPowerupStatusIcons
