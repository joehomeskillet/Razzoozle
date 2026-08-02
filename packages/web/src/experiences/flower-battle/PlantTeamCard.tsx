/**
 * PlantTeamCard — kompakte weisse Teamkarte direkt unter einer Pflanze
 * (FB-HUD4 / SDD-Gartenkorrektur). Eine Karte pro aktivem Team, niemals
 * global am Viewport verankert, niemals fix pro Teamfarbe positioniert.
 *
 * Daten kommen ausschliesslich aus dem autoritativen Spielzustand
 * (`FlowerBattleTeamState`): keine Mock-Werte, keine festen Pixelpositionen.
 *
 * Layout: Element fliesst im Grid seines `PlantTeamSlot`. Layout, Skalierung
 * und Bewegung folgen dem Slot; ein `isolation: isolate` am Slot-Ancestor
 * reicht, damit der z-Index der Karte sich an ihrem Container orientiert.
 */

import { useTranslation } from "react-i18next"

import { TEAMS, type Team } from "@razzoozle/common/constants"
import { teamDot } from "@razzoozle/web/features/game/utils/teams"

import type { FlowerBattleTeamState } from "./flower-battle-scene.types"

/** Maximale Wachstumsstufen (Spielziel). Spiegel `teamHud.METER_GROWTH_SEGMENTS`. */
export const PLANT_TEAM_CARD_MAX_GROWTH = 10
/** Maximale Sonnenpunkte (Spielziel). Spiegel `teamHud.METER_SUN_SEGMENTS`. */
export const PLANT_TEAM_CARD_MAX_SUN = 3

export interface PlantTeamCardProps {
  /** Teamname (zugleich stabiler Team-Identifier, kein eigener id-Feld). */
  teamName: string
  /** Team-Key fuer die Farbe (`red` / `blue` / `green` / `yellow`). */
  teamKey: string
  /** Aktuelle Wachstumsstufe 0..PLANT_TEAM_CARD_MAX_GROWTH. */
  growthStage: number
  /** Aktuelle Sonnenpunkte 0..PLANT_TEAM_CARD_MAX_SUN. */
  sunPoints: number
}

const resolveTeamKey = (teamKey: string): Team => {
  if ((TEAMS as readonly string[]).includes(teamKey)) {
    return teamKey as Team
  }
  return TEAMS[0]
}

/**
 * Maps a free-form team name to one of the fixed team colour keys.
 * Identity-first (never the team-array index) so a team named "Blue"
 * always paints the blue dot, even if it sits at array position 0.
 *
 *  1. If `name` contains a keyword (English "red/blue/green/yellow"
 *     or German "rot/blau/grün/gelb") → that colour.
 *  2. Otherwise: stable FNV-style 32-bit hash of `name` → index in
 *     `TEAMS`. Same name ⇒ same colour across renders.
 *
 * Exported for unit tests; pure / no DOM / no i18n.
 */
const NAME_TO_TEAM_KEYWORD: Record<string, Team> = {
  red: "red",
  blue: "blue",
  green: "green",
  yellow: "yellow",
  rot: "red",
  blau: "blue",
  grün: "green",
  gelb: "yellow",
}

export const teamKeyFromName = (name: string): Team => {
  if (typeof name === "string" && name.length > 0) {
    const lower = name.toLowerCase()
    for (const [keyword, colour] of Object.entries(NAME_TO_TEAM_KEYWORD)) {
      if (lower.includes(keyword)) return colour
    }
    // Stable hash fallback — identical name yields identical colour.
    let hash = 0
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash * 31 + name.charCodeAt(i)) | 0
    }
    const idx = Math.abs(hash) % TEAMS.length
    return TEAMS[idx]!
  }
  return TEAMS[0]
}

const clampToRange = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

const safeGrowth = (value: number | undefined | null): number =>
  clampToRange(Math.floor(value ?? 0), 0, PLANT_TEAM_CARD_MAX_GROWTH)

const safeSun = (value: number | undefined | null): number =>
  clampToRange(Math.floor(value ?? 0), 0, PLANT_TEAM_CARD_MAX_SUN)

const safeSunPercent = (points: number): number =>
  Math.round((points / PLANT_TEAM_CARD_MAX_SUN) * 100)

const growthTargetOf = (value: number | undefined | null): number => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return PLANT_TEAM_CARD_MAX_GROWTH
  }
  return clampToRange(Math.floor(value), 1, PLANT_TEAM_CARD_MAX_GROWTH)
}

/**
 * Stellt sicher, dass der Teamname nicht das Layout zerstoert. Sehr lange
 * Namen werden via `truncate` (CSS-ellipsis) gekuerzt; ein `title`-Attribut
 * laesst den vollen Namen via Tooltip / Screen-Reader erscheinen.
 */
const trimDisplayName = (name: string): string => {
  if (typeof name !== "string") return ""
  return name.trim()
}

/**
 * PlantTeamCard — eine Karte pro aktivem Team. Wird ausschliesslich im
 * `PlantTeamSlot` platziert; keine Viewport-Verankerung, keine festen
 * `left`/`right`-Werte pro Teamfarbe. Reagiert auf das Grid des Slots.
 */
export const PlantTeamCard = ({
  teamName,
  teamKey,
  growthStage,
  sunPoints,
}: PlantTeamCardProps) => {
  const { t } = useTranslation("experience_hud")

  const safeKey = resolveTeamKey(teamKey)
  const dotClass = teamDot(safeKey) ?? "bg-team-red"
  const displayName = trimDisplayName(teamName)
  const safeStage = safeGrowth(growthStage)
  const safeStageTarget = growthTargetOf(PLANT_TEAM_CARD_MAX_GROWTH)
  const safeSunPoints = safeSun(sunPoints)
  const safePercent = clampToRange(safeSunPercent(safeSunPoints), 0, 100)
  const growthPercent = clampToRange(
    Math.round((safeStage / safeStageTarget) * 100),
    0,
    100,
  )

  return (
    <div
      data-testid="plant-team-card"
      data-team-key={safeKey}
      data-team-name={displayName}
      role="group"
      aria-label={t("flowerBattlePresenter.plantCard.ariaLabel", {
        name: displayName,
        stage: safeStage,
        target: safeStageTarget,
        percent: safePercent,
        defaultValue: `Team ${displayName} — ${safeStage} von ${safeStageTarget} Fortschritt, ${safePercent} Prozent Sonnenpunkte`,
      })}
      className="plant-team-card relative isolate w-full min-w-0 rounded-[14px] bg-[var(--surface-cream)] px-3 py-2.5 text-ink"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          data-testid="plant-team-card-dot"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
        />
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold"
          title={displayName}
        >
          {displayName}
        </span>
        <span className="shrink-0 text-sm font-bold [font-variant-numeric:tabular-nums_slashed-zero]">
          {`${safeStage}/${safeStageTarget}`}
        </span>
      </div>

      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-[var(--ink-muted)]">
          {t("flowerBattlePresenter.sunPoints.label", {
            defaultValue: "Sonnenpunkte",
          })}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 font-semibold [font-variant-numeric:tabular-nums]"
        >
          {`${safePercent} %`}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeStageTarget}
        aria-valuenow={safeStage}
        aria-valuetext={t("flowerBattlePresenter.plantCard.progressAria", {
          stage: safeStage,
          target: safeStageTarget,
          percent: safePercent,
          defaultValue: `Wachstum ${safeStage} von ${safeStageTarget}, Sonnenpunkte ${safePercent} Prozent`,
        })}
        data-testid="plant-team-card-progress"
        data-progress-percent={growthPercent}
        data-sun-percent={safePercent}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]"
      >
        <div
          aria-hidden="true"
          className={`h-full rounded-full ${dotClass}`}
          style={{ width: `${growthPercent}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Convenience-Selector: leitet die Karten-Props aus dem vollen
 * `FlowerBattleTeamState` ab, ohne dass der Aufrufer Mapping-Code wiederholen
 * muss. Bleibt rein (kein Store-Zugriff, keine Side-Effects) und ist daher
 * trivial in Unit-Tests einsetzbar.
 *
 * `teamKey` is derived from `team.name` (keyword match + stable hash
 * fallback) so the colour always reflects the team's identity, never
 * its array position. The `index` argument is kept for API stability
 * with call sites that already pass a slot index.
 */
export const plantTeamCardPropsFromTeam = (
  team: FlowerBattleTeamState,
  _index: number,
): PlantTeamCardProps => {
  const teamKey = teamKeyFromName(team.name)
  return {
    teamName: team.name,
    teamKey,
    growthStage: team.growthStage,
    sunPoints: team.sunPoints,
  }
}
