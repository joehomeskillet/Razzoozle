import { TEAMS } from "@razzoozle/common/constants"

import {
  ExperienceLayer,
  ExperienceSafeArea,
  ExperienceStage,
  ExperienceViewport,
} from "../shared/stage"
import { createSeededRandom } from "../shared/random"
import { GardenBackgroundLayer } from "./GardenBackgroundLayer"
import { FlowerPlant } from "./FlowerPlant"
import { FlowerPowerupEffects } from "./FlowerPowerupEffects"
import type { FlowerVariant, TeamColorKey } from "./flower-plant.constants"
import {
  GARDEN_SCENE_ACTORS_ZONE_WIDTH_PERCENT,
  GARDEN_SCENE_BACKGROUND_ZONE_WIDTH_PERCENT,
  GARDEN_SCENE_HUD_ZONE_WIDTH_PERCENT,
} from "./garden-scene-safe-zones"
import type { FlowerBattleTeamState } from "./flower-battle-scene.types"

const FLOWER_VARIANTS: FlowerVariant[] = ["round", "tulip", "sun", "bell"]
export const MAX_TEAMS = 4
export const MIN_TEAMS = 2

export interface FlowerGardenSceneProps {
  /** Wire seed is a String (server CSPRNG, WP-939A) — number kept for legacy callers. */
  seed: number | string
  /** Wire recipeVersion is a number; string kept for legacy callers. */
  recipeVersion: number | string
  teams: FlowerBattleTeamState[]
  className?: string
}

const teamColorForIndex = (index: number): TeamColorKey => {
  const team = TEAMS[index]
  return (team ?? TEAMS[0]) as TeamColorKey
}

const variantForTeam = (seed: number | string, index: number): FlowerVariant => {
  const rng = createSeededRandom(`${seed}-plant-${index}`)
  const variantIndex = Math.floor(rng() * FLOWER_VARIANTS.length)
  return FLOWER_VARIANTS[variantIndex] ?? "round"
}

/**
 * FlowerGardenScene — deterministic garden stage for Flower Battle presenter
 * display (WP-937). Composes Experience Kit stage layers with vertical safe
 * zones: hud (0–16 %), background (16–64 %), actors (64–100 %).
 *
 * WP-958D: the hud/actors bands themselves render no artwork (hud is an
 * empty reservation, actors only draws the narrow plant graphics) — the
 * app-wide icon backdrop showed through around them. A single opaque
 * full-scene fill sits behind all three zones so the scene is opaque edge
 * to edge, while GardenBackgroundLayer keeps painting its own scenery only
 * inside the background band.
 */
export const FlowerGardenScene = ({
  seed,
  recipeVersion,
  teams,
  className = "",
}: FlowerGardenSceneProps) => {
  const visibleTeams = teams.slice(0, MAX_TEAMS)

  return (
    <ExperienceViewport
      className={`@container min-h-0 w-full ${className}`.trim()}
    >
      <ExperienceStage className="relative h-full w-full">
        <div
          data-testid="flower-garden-scene"
          data-seed={seed}
          data-recipe-version={recipeVersion}
          data-team-count={visibleTeams.length}
          className="relative h-full w-full"
        >
          <div
            data-testid="garden-scene-backdrop"
            className="absolute inset-0 bg-surface-2"
            aria-hidden="true"
          />
          <ExperienceSafeArea className="relative h-full w-full">
            <ExperienceLayer name="hud" className="absolute inset-x-0 top-0">
              <div
                data-testid="garden-zone-hud"
                className="w-full"
                style={{ height: `${GARDEN_SCENE_HUD_ZONE_WIDTH_PERCENT}%` }}
                aria-hidden="true"
              />
            </ExperienceLayer>

            <ExperienceLayer name="background" className="absolute inset-x-0">
              <div
                data-testid="garden-zone-background"
                className="w-full overflow-hidden"
                style={{
                  marginTop: `${GARDEN_SCENE_HUD_ZONE_WIDTH_PERCENT}%`,
                  height: `${GARDEN_SCENE_BACKGROUND_ZONE_WIDTH_PERCENT}%`,
                }}
              >
                <GardenBackgroundLayer seed={seed} recipeVersion={recipeVersion} />
              </div>
            </ExperienceLayer>

            <ExperienceLayer name="actors" className="absolute inset-x-0 bottom-0">
              <div
                data-testid="garden-zone-actors"
                className="flex w-full items-end justify-center gap-[5%] px-[5%] pb-[5%]"
                style={{ height: `${GARDEN_SCENE_ACTORS_ZONE_WIDTH_PERCENT}%` }}
              >
                {visibleTeams.map((team, index) => (
                  <div
                    key={`${team.name}-${index}`}
                    data-testid={`garden-team-slot-${index}`}
                    data-team-name={team.name}
                    // WP-958D: at 1–2 teams flex-1 gives the slot almost the
                    // full row width, and the plant's own aspect-preserving
                    // svg scaling then grows to fill it, dwarfing the scene.
                    // max-w (in container-query width units, so it stays
                    // correct at any scene size) caps the slot regardless of
                    // team count; the 3–4 team slots are already narrower
                    // than the cap, so nothing changes there.
                    className="relative flex h-full min-w-0 max-w-[26cqw] flex-1 items-end justify-center"
                  >
                    <FlowerPlant
                      variant={variantForTeam(seed, index)}
                      teamColor={teamColorForIndex(index)}
                      growthStage={team.growthStage}
                    />
                    <FlowerPowerupEffects activeEffects={team.effects} />
                  </div>
                ))}
              </div>
            </ExperienceLayer>
          </ExperienceSafeArea>
        </div>
      </ExperienceStage>
    </ExperienceViewport>
  )
}
