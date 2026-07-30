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
  seed: number
  recipeVersion: string
  teams: FlowerBattleTeamState[]
  className?: string
}

const teamColorForIndex = (index: number): TeamColorKey => {
  const team = TEAMS[index]
  return (team ?? TEAMS[0]) as TeamColorKey
}

const variantForTeam = (seed: number, index: number): FlowerVariant => {
  const rng = createSeededRandom(`${seed}-plant-${index}`)
  const variantIndex = Math.floor(rng() * FLOWER_VARIANTS.length)
  return FLOWER_VARIANTS[variantIndex] ?? "round"
}

const growthStageFromSunPoints = (sunPoints: number): number => {
  const safe = Number.isFinite(sunPoints) ? Math.max(0, Math.floor(sunPoints)) : 0
  return Math.min(10, safe)
}

/**
 * FlowerGardenScene — deterministic garden stage for Flower Battle presenter
 * display (WP-937). Composes Experience Kit stage layers with vertical safe
 * zones: hud (0–16 %), background (16–64 %), actors (64–100 %).
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
                    className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                  >
                    <FlowerPlant
                      variant={variantForTeam(seed, index)}
                      teamColor={teamColorForIndex(index)}
                      growthStage={growthStageFromSunPoints(team.sunPoints)}
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
