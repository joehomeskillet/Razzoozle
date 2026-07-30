import type { CSSProperties } from "react"
import { useMemo } from "react"

import {
  createGardenBackgroundRecipe,
  CURRENT_GARDEN_RECIPE_VERSION,
  type GardenBackgroundRecipe,
} from "./background"
import { GARDEN_EDGE_FOLIAGE_BAND_WIDTH_PERCENT } from "./background/garden-safe-zones"
import type {
  GardenCloudPlacement,
  GardenEdgeFoliagePlacement,
  GardenSkyPaletteId,
} from "./background/garden-background.types"

export interface GardenBackgroundLayerProps {
  seed: number | string
  recipeVersion: number | string
}

const parseRecipeVersion = (version: number | string): number => {
  if (typeof version === "number" && Number.isFinite(version)) {
    return version
  }
  const parsed = Number.parseInt(String(version), 10)
  return Number.isFinite(parsed) ? parsed : CURRENT_GARDEN_RECIPE_VERSION
}

/**
 * Opaque per-palette sky tone (mapped tokens only — WP-958B). Deliberately
 * neutral/brand tokens, not team-identity colors: the four garden sky
 * palettes must never visually collide with a team's assigned color in the
 * actors zone below.
 */
const GARDEN_SKY_TONE_CLASSNAME: Record<GardenSkyPaletteId, string> = {
  morning: "bg-accent-tint",
  midday: "bg-surface-2",
  "warm-afternoon": "bg-surface-3",
  "soft-overcast": "bg-surface-4",
}

// Vertical bands (percent of the background-zone box), farthest first.
const CLOUD_BAND_TOP_PERCENT = 6
const CLOUD_WIDTH_PERCENT = 16
const CLOUD_HEIGHT_PERCENT = 14

const DISTANT_FEATURE_TOP_PERCENT = 22
const DISTANT_FEATURE_LEFT_PERCENT = 66
const DISTANT_FEATURE_WIDTH_PERCENT = 16
const DISTANT_FEATURE_HEIGHT_PERCENT = 18

const HORIZON_BOTTOM_PERCENT = 12
const HORIZON_HEIGHT_PERCENT = 26

const BOUNDARY_HEIGHT_PERCENT = 12

const EDGE_FOLIAGE_HEIGHT_PERCENT = 26

const CatalogPlaceholder = ({
  catalogId,
  layer,
  mirrored,
  side,
  className = "",
  style,
}: {
  catalogId: string
  layer: string
  mirrored?: boolean
  side?: string
  className?: string
  style?: CSSProperties
}) => (
  <div
    data-testid={`garden-catalog-${catalogId}`}
    data-catalog-id={catalogId}
    data-layer={layer}
    data-mirrored={mirrored ? "true" : "false"}
    data-side={side}
    className={`absolute rounded-sm ${mirrored ? "-scale-x-100" : ""} ${className}`.trim()}
    style={style}
    aria-hidden="true"
  />
)

/**
 * Composes the recipe into opaque, absolutely-positioned zone layers (sky →
 * distant → clouds → horizon → boundary → edge-foliage, back to front via
 * DOM order). Foundation-only: solid token-color rectangles, not final
 * artwork — the PixiJS program (issue 962) replaces this scene later; this
 * stays the static fallback. Every layer is fully opaque so the app-wide
 * icon backdrop never shows through (WP-958B).
 */
const renderRecipe = (recipe: GardenBackgroundRecipe) => {
  const cloudSlotPercent = 100 / (recipe.clouds.length + 1)
  const leftFoliage = recipe.edgeFoliage.filter((item) => item.side === "left")
  const rightFoliage = recipe.edgeFoliage.filter((item) => item.side === "right")

  return (
    <div
      data-testid="garden-background-layer"
      data-recipe-version={recipe.recipeVersion}
      data-sky={recipe.sky}
      className="relative h-full w-full overflow-hidden"
    >
      <CatalogPlaceholder
        catalogId={recipe.sky}
        layer="sky"
        className={`inset-0 ${GARDEN_SKY_TONE_CLASSNAME[recipe.sky]}`}
      />

      {recipe.distantFeature ? (
        <CatalogPlaceholder
          catalogId={recipe.distantFeature}
          layer="distant-feature"
          className="bg-surface-3"
          style={{
            top: `${DISTANT_FEATURE_TOP_PERCENT}%`,
            left: `${DISTANT_FEATURE_LEFT_PERCENT}%`,
            width: `${DISTANT_FEATURE_WIDTH_PERCENT}%`,
            height: `${DISTANT_FEATURE_HEIGHT_PERCENT}%`,
          }}
        />
      ) : null}

      {recipe.clouds.map((cloud: GardenCloudPlacement, index) => (
        <CatalogPlaceholder
          key={`cloud-${cloud.id}-${index}`}
          catalogId={cloud.id}
          layer="cloud"
          mirrored={cloud.mirrored}
          className="rounded-full bg-surface-2"
          style={{
            top: `${CLOUD_BAND_TOP_PERCENT}%`,
            left: `${cloudSlotPercent * (index + 1) - CLOUD_WIDTH_PERCENT / 2}%`,
            width: `${CLOUD_WIDTH_PERCENT}%`,
            height: `${CLOUD_HEIGHT_PERCENT}%`,
          }}
        />
      ))}

      <CatalogPlaceholder
        catalogId={recipe.horizon}
        layer="horizon"
        className="inset-x-0 bg-surface-4"
        style={{
          bottom: `${HORIZON_BOTTOM_PERCENT}%`,
          height: `${HORIZON_HEIGHT_PERCENT}%`,
        }}
      />

      <CatalogPlaceholder
        catalogId={recipe.boundary}
        layer="boundary"
        className="inset-x-0 bottom-0 bg-surface-5"
        style={{ height: `${BOUNDARY_HEIGHT_PERCENT}%` }}
      />

      {leftFoliage.map((foliage: GardenEdgeFoliagePlacement, index) => (
        <CatalogPlaceholder
          key={`foliage-${foliage.id}-${index}`}
          catalogId={foliage.id}
          layer="edge-foliage"
          mirrored={foliage.mirrored}
          side={foliage.side}
          className="left-0 bg-surface-4"
          style={{
            bottom: `${index * EDGE_FOLIAGE_HEIGHT_PERCENT}%`,
            width: `${GARDEN_EDGE_FOLIAGE_BAND_WIDTH_PERCENT}%`,
            height: `${EDGE_FOLIAGE_HEIGHT_PERCENT}%`,
          }}
        />
      ))}
      {rightFoliage.map((foliage: GardenEdgeFoliagePlacement, index) => (
        <CatalogPlaceholder
          key={`foliage-${foliage.id}-${index}`}
          catalogId={foliage.id}
          layer="edge-foliage"
          mirrored={foliage.mirrored}
          side={foliage.side}
          className="right-0 bg-surface-4"
          style={{
            bottom: `${index * EDGE_FOLIAGE_HEIGHT_PERCENT}%`,
            width: `${GARDEN_EDGE_FOLIAGE_BAND_WIDTH_PERCENT}%`,
            height: `${EDGE_FOLIAGE_HEIGHT_PERCENT}%`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Renders a {@link GardenBackgroundRecipe} as opaque zone layers (W0 →
 * foundation fix WP-958B). Deterministic for a given seed + recipeVersion
 * pair.
 */
export const GardenBackgroundLayer = ({
  seed,
  recipeVersion,
}: GardenBackgroundLayerProps) => {
  const recipe = useMemo(
    () => createGardenBackgroundRecipe(String(seed), parseRecipeVersion(recipeVersion)),
    [seed, recipeVersion],
  )

  return renderRecipe(recipe)
}
