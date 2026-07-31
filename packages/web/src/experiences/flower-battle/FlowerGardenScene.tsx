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
import {
  getTeamSlotLayout,
  TEAM_SLOT_MAX_TEAMS,
  type TeamSlotViewport,
} from "./garden-team-slot-layout"
import type { FlowerBattleTeamState } from "./flower-battle-scene.types"

const FLOWER_VARIANTS: FlowerVariant[] = ["round", "tulip", "sun", "bell"]
export const MAX_TEAMS = 4
export const MIN_TEAMS = 2
/**
 * Hard upper cap mirrors `garden-team-slot-layout.TEAM_SLOT_MAX_TEAMS`.
 * The DOM scene renders ALL teams from the wire (per SDD §20.3 grid
 * fallback); this constant is kept as the public-contract constant other
 * modules import and as the same defensive ceiling the layout function uses.
 */
export const TEAM_SLOT_HARD_CAP = TEAM_SLOT_MAX_TEAMS

export interface FlowerGardenSceneProps {
  /** Wire seed is a String (server CSPRNG, WP-939A) — number kept for legacy callers. */
  seed: number | string
  /** Wire recipeVersion is a number; string kept for legacy callers. */
  recipeVersion: number | string
  teams: FlowerBattleTeamState[]
  className?: string
  /** Optional explicit viewport override (tests). Defaults to a sane non-zero fallback. */
  viewport?: TeamSlotViewport
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

const DEFAULT_VIEWPORT: TeamSlotViewport = { width: 1024, height: 768 }

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
 *
 * WP-D-1 (SDD §20.3): team slots are positioned by
 * `getTeamSlotLayout(teamCount, viewport)` — 2 teams = two large slots,
 * 3 teams = three equal slots, 4 teams = 2×2 grid, 5+ = deterministic grid
 * fallback, 0 teams = empty. Positions are stable for equal teamCount so
 * React reuses existing DOM nodes across re-renders.
 */
export const FlowerGardenScene = ({
  seed,
  recipeVersion,
  teams,
  className = "",
  viewport,
}: FlowerGardenSceneProps) => {
  // Per SDD §20.3: render ALL teams in a grid fallback for unexpected
  // counts. The cap-at-4 behaviour of WP-937 is replaced by the layout
  // function's defensive ceiling.
  const visibleTeams = teams
  // WP-958D: a sparse game (0–1 teams, i.e. below the normal MIN_TEAMS
  // minimum) gives a single flex-1 slot almost the full row width, and the
  // plant's aspect-preserving svg scaling then grows to fill it (~55 % of the
  // screen live). Sparse slots get a responsive container-relative max width
  // (~the per-slot width of a normal 3-team game) so a lone plant renders at
  // intentional, multi-team-comparable scale. Normal 2–4 team layouts keep
  // their uncapped flex-1 sizing — the cap must not shrink them.
  const isSparseTeamLayout = visibleTeams.length < MIN_TEAMS
  const slots = getTeamSlotLayout(
    visibleTeams.length,
    viewport ?? DEFAULT_VIEWPORT,
  )

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
                data-slot-count={slots.length}
                className="relative w-full"
                style={{ height: `${GARDEN_SCENE_ACTORS_ZONE_WIDTH_PERCENT}%` }}
              >
                {slots.map((slot) => {
                  const team = visibleTeams[slot.index]
                  if (!team) return null
                  return (
                    <div
                      key={team.name}
                      data-testid={`garden-team-slot-${slot.index}`}
                      data-team-name={team.name}
                      data-slot-x={slot.xPercent}
                      data-slot-y={slot.yPercent}
                      data-slot-w={slot.widthPercent}
                      data-slot-h={slot.heightPercent}
                      className={`absolute flex items-end justify-center ${
                        isSparseTeamLayout ? "max-w-[26cqw]" : ""
                      }`.trim()}
                      style={{
                        left: `${slot.xPercent}%`,
                        top: `${slot.yPercent}%`,
                        width: `${slot.widthPercent}%`,
                        height: `${slot.heightPercent}%`,
                      }}
                    >
                      <FlowerPlant
                        variant={variantForTeam(seed, slot.index)}
                        teamColor={teamColorForIndex(slot.index)}
                        growthStage={team.growthStage}
                      />
                      <FlowerPowerupEffects activeEffects={team.effects} />
                    </div>
                  )
                })}
              </div>
            </ExperienceLayer>
          </ExperienceSafeArea>
        </div>
      </ExperienceStage>
    </ExperienceViewport>
  )
}