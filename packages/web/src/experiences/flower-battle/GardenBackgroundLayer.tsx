import { useMemo } from "react"

import {
  createGardenBackgroundRecipe,
  CURRENT_GARDEN_RECIPE_VERSION,
  type GardenBackgroundRecipe,
} from "./background"
import type { GardenCloudPlacement, GardenEdgeFoliagePlacement } from "./background/garden-background.types"

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

const CatalogPlaceholder = ({
  catalogId,
  layer,
  mirrored,
  side,
}: {
  catalogId: string
  layer: string
  mirrored?: boolean
  side?: string
}) => (
  <div
    data-testid={`garden-catalog-${catalogId}`}
    data-catalog-id={catalogId}
    data-layer={layer}
    data-mirrored={mirrored ? "true" : "false"}
    data-side={side}
    className="h-full min-h-0 w-full rounded-sm border border-dashed border-line bg-surface-2/40"
    aria-hidden="true"
  />
)

const renderRecipe = (recipe: GardenBackgroundRecipe) => (
  <div
    data-testid="garden-background-layer"
    data-recipe-version={recipe.recipeVersion}
    data-sky={recipe.sky}
    className="relative flex h-full w-full flex-col gap-1 overflow-hidden p-[5%]"
  >
    <CatalogPlaceholder catalogId={recipe.sky} layer="sky" />
    <div className="flex flex-1 gap-1" data-layer="clouds">
      {recipe.clouds.map((cloud: GardenCloudPlacement, index) => (
        <CatalogPlaceholder
          key={`cloud-${cloud.id}-${index}`}
          catalogId={cloud.id}
          layer="cloud"
          mirrored={cloud.mirrored}
        />
      ))}
    </div>
    <CatalogPlaceholder catalogId={recipe.horizon} layer="horizon" />
    <CatalogPlaceholder catalogId={recipe.boundary} layer="boundary" />
    <div className="flex gap-1" data-layer="edge-foliage">
      {recipe.edgeFoliage.map((foliage: GardenEdgeFoliagePlacement, index) => (
        <CatalogPlaceholder
          key={`foliage-${foliage.id}-${index}`}
          catalogId={foliage.id}
          layer="edge-foliage"
          mirrored={foliage.mirrored}
          side={foliage.side}
        />
      ))}
    </div>
    {recipe.distantFeature ? (
      <CatalogPlaceholder catalogId={recipe.distantFeature} layer="distant-feature" />
    ) : null}
  </div>
)

/**
 * Renders a {@link GardenBackgroundRecipe} as placeholder catalog divs (W0).
 * Deterministic for a given seed + recipeVersion pair.
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
