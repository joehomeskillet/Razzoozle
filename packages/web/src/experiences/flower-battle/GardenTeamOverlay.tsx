/**
 * GardenTeamOverlay — DOM overlay of `PlantTeamCard`s on top of the PixiJS
 * garden canvas. Anchored via `getTeamSlotLayout` so the cards sit under
 * the matching plant even when the canvas itself is letterboxed.
 *
 * Why: FB-HUD4 spec is `PlantTeamCard directly under the plant`. The Pixi
 * scene renders the plants but no DOM layer above the canvas ever showed
 * the per-team HUD — `FlowerGardenScene` (which carries the cards) only
 * renders as the static-fallback DOM scene. This overlay closes the gap
 * for the live presenter view: one card per active team, no global HUD.
 *
 * Layer model:
 *  - z-10 above the canvas (z-0) but below the experience HUD chrome.
 *  - pointer-events-none on the wrapper, pointer-events-auto on the
 *    card so the scene drag/zoom (if any) keeps working.
 *  - plant-anchor coordinates are converted to a percentage box (same
 *    helper that drives FlowerGardenScene), so the overlay survives
 *    viewport resizes.
 */

import { useMemo } from "react"

import {
  getTeamSlotLayout,
  type TeamSlotViewport,
} from "./garden-team-slot-layout"
import { PlantTeamCard, plantTeamCardPropsFromTeam } from "./PlantTeamCard"
import type { FlowerBattleTeamState } from "./flower-battle-scene.types"

export interface GardenTeamOverlayProps {
  teams: readonly FlowerBattleTeamState[]
  viewport: TeamSlotViewport
}

export const GardenTeamOverlay = ({
  teams,
  viewport,
}: GardenTeamOverlayProps) => {
  const slots = useMemo(
    () => getTeamSlotLayout(teams.length, viewport),
    [teams.length, viewport.width, viewport.height],
  )

  if (teams.length === 0) return null

  return (
    <div
      data-testid="garden-team-overlay"
      aria-hidden="false"
      className="pointer-events-none absolute inset-0 z-10"
    >
      {slots.map((slot) => {
        const team = teams[slot.index]
        if (!team) return null
        const cardProps = plantTeamCardPropsFromTeam(team, slot.index)
        return (
          <div
            key={`garden-team-overlay-${slot.index}`}
            data-testid={`garden-team-overlay-slot-${slot.index}`}
            data-team-name={team.name}
            className="pointer-events-none absolute flex items-end justify-center"
            style={{
              left: `${slot.xPercent}%`,
              top: `${slot.yPercent}%`,
              width: `${slot.widthPercent}%`,
              height: `${slot.heightPercent}%`,
            }}
          >
            <div className="pointer-events-auto w-full max-w-[clamp(168px,14vw,230px)] pb-2">
              <PlantTeamCard {...cardProps} />
            </div>
          </div>
        )
      })}
    </div>
  )
}