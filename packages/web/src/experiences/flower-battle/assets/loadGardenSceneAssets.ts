/**
 * Production garden-scene asset loader (WP-19 finisher).
 *
 * Happy path:
 *   1. Fetch each Vite-hashed SVG as text
 *   2. Bake palette / ink colours into the SVG (currentColor + CSS vars do
 *      not resolve when Pixi rasterises standalone SVGs)
 *   3. Load the baked data-URI via PixiJS v8 Assets API
 *   4. Map textures into LayerAssets + plant head map + diagnostics
 *
 * Never throws for partial failures: diagnostics list missing/failed aliases
 * and the host may still build a procedural scene. The happy path expects
 * zero missing required aliases.
 */

import { Assets, Texture } from "pixi.js"

import type { LayerAssets } from "../rendering/gardenLayers"
import type { GardenPalette } from "../rendering/gardenPalette"
import {
  GARDEN_SCENE_ASSET_URLS,
  GARDEN_SCENE_REQUIRED_ALIASES,
  type GardenSceneAssetAlias,
} from "./garden-scene-asset-urls"

export interface GardenAssetDiagnostics {
  requiredAliases: readonly string[]
  loadedAliases: string[]
  missingAliases: string[]
  failedUrls: string[]
  fallbackAliases: string[]
  usedSpriteAliases: string[]
}

export interface PlantHeadTextures {
  round: Texture
  bell: Texture
  sun: Texture
  tulip: Texture
  faceHappy?: Texture
}

export interface GardenSceneLoadedAssets {
  layers: LayerAssets
  plantHeads: Partial<PlantHeadTextures>
  texturesByAlias: Record<string, Texture>
  diagnostics: GardenAssetDiagnostics
  /** True when every required alias loaded a usable Texture. */
  complete: boolean
}

/** Convert 0xRRGGBB to #rrggbb for SVG attribute injection. */
export function hexToCssColor(value: number): string {
  const n = Math.max(0, Math.min(0xffffff, value >>> 0))
  return `#${n.toString(16).padStart(6, "0")}`
}

/**
 * Bake monochrome / token-driven SVGs so Pixi rasterisation sees concrete
 * colours. `fill` becomes currentColor; `ink` covers face/line strokes.
 */
export function bakeSvgForPixi(
  raw: string,
  colors: { fill: string; ink: string; accent?: string },
): string {
  const accent = colors.accent ?? colors.fill
  // HTML comments can contain non-ASCII (em dash) that breaks some SVG parsers.
  let out = raw.replace(/<!--[\s\S]*?-->/g, "")
  // Positive viewBox + translate so HTMLImageElement / Pixi rasterise flower
  // heads that were authored with origin-centred (negative) viewBoxes.
  out = normalizeSvgViewBox(out)
  // CSS custom properties first (longer patterns before short currentColor).
  out = out.replace(
    /var\(--flower-battle-sky(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-sun(?:,[^)]*)?\)/gi,
    accent,
  )
  out = out.replace(
    /var\(--flower-battle-cloud(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-hill-back(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-hill-mid(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-bush(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-fence(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-grass(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-soil(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-foreground(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(
    /var\(--flower-battle-primary(?:,[^)]*)?\)/gi,
    accent,
  )
  out = out.replace(
    /var\(--flower-battle-ink(?:,[^)]*)?\)/gi,
    colors.ink,
  )
  out = out.replace(
    /var\(--flower-battle-cream(?:,[^)]*)?\)/gi,
    colors.fill,
  )
  out = out.replace(/var\(--sky-color-[^,)]+(?:,[^)]*)?\)/gi, colors.fill)
  out = out.replace(/var\(--status-pending-bg(?:,[^)]*)?\)/gi, accent)
  out = out.replace(/var\(--status-online-text(?:,[^)]*)?\)/gi, colors.ink)
  out = out.replace(/var\(--line(?:,[^)]*)?\)/gi, colors.ink)
  out = out.replace(/currentColor/g, colors.fill)
  return out
}

function toDataUri(svgText: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
}

/**
 * Rewrite `viewBox="minX minY w h"` with negative minX/minY into a positive
 * box and wrap children in a compensating translate. Negative-origin SVGs
 * often decode as blank/black bitmaps in Chromium Image + Pixi paths.
 */
export function normalizeSvgViewBox(svg: string): string {
  const match = svg.match(
    /viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i,
  )
  if (!match) return svg
  const minX = Number(match[1])
  const minY = Number(match[2])
  const w = Number(match[3])
  const h = Number(match[4])
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return svg
  if (minX >= 0 && minY >= 0) return svg

  let out = svg.replace(
    match[0],
    `viewBox="0 0 ${w} ${h}"`,
  )
  // Insert a single wrapping group just inside the root <svg>.
  out = out.replace(
    /(<svg\b[^>]*>)/i,
    `$1<g transform="translate(${-minX} ${-minY})">`,
  )
  out = out.replace(/<\/svg>\s*$/i, "</g></svg>")
  return out
}

function isTexture(value: unknown): value is Texture {
  return (
    value != null &&
    typeof value === "object" &&
    "width" in value &&
    "height" in value &&
    Number((value as Texture).width) > 0 &&
    Number((value as Texture).height) > 0
  )
}

/**
 * Rasterise an SVG data-URI via HTMLImageElement → Canvas2D → Pixi Texture.
 * Canvas intermediate avoids black-square textures that Texture.from(img)
 * sometimes produces for SVG sources with transparent backgrounds.
 */
async function textureFromImage(
  dataUri: string,
  size = 256,
): Promise<Texture> {
  const img = new Image()
  img.decoding = "async"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("SVG image decode failed"))
    img.src = dataUri
  })
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return Texture.from(img)
  }
  ctx.clearRect(0, 0, size, size)
  // Contain-fit the SVG into the square canvas.
  const iw = img.naturalWidth || size
  const ih = img.naturalHeight || size
  const scale = Math.min(size / iw, size / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
  return Texture.from(canvas)
}

function paletteFillForAlias(
  alias: GardenSceneAssetAlias,
  palette: GardenPalette,
): { fill: string; ink: string; accent: string } {
  const ink = hexToCssColor(palette.plantStem)
  const accent = hexToCssColor(palette.sun)
  const map: Record<GardenSceneAssetAlias, number> = {
    bg_sky_day: palette.sky,
    bg_sun_glow: palette.sun,
    bg_cloud_01: palette.cloud,
    bg_cloud_02: palette.cloud,
    bg_cloud_03: palette.cloud,
    bg_hill_back_01: palette.hillBack,
    bg_bush_back_01: palette.bushBack,
    bg_tree_mid_01: palette.midground,
    env_fence_white: palette.fence,
    env_grass_base: palette.grass,
    env_grass_detail_01: palette.foreground,
    env_soil_plot_01: palette.soil,
    env_foreground_leaf_left: palette.foreground,
    env_foreground_leaf_right: palette.foreground,
    env_foreground_bush_01: palette.bushMid,
    // Concrete petal / face colours (no white+tint — SVG faces stay readable).
    plant_head_round: palette.plantPetal,
    plant_head_bell: palette.plantPetal,
    plant_head_sun: palette.sun,
    plant_head_tulip: palette.plantPetal,
    face_emote_happy: palette.plantPetal,
  }
  return {
    fill: hexToCssColor(map[alias]),
    ink,
    accent,
  }
}

let assetsInitPromise: Promise<void> | null = null

async function ensurePixiAssetsInit(): Promise<void> {
  assetsInitPromise ??= Assets.init({ skipDetections: true }).catch(
    (err: unknown) => {
      assetsInitPromise = null
      const cause = err instanceof Error ? err : new Error(String(err))
      throw new Error(cause.message, { cause })
    },
  )
  await assetsInitPromise
}

/**
 * Load every garden-scene production SVG, bake colours, return typed maps.
 * Safe to call once per attach; concurrent callers should share externally.
 */
export async function loadGardenSceneAssets(
  palette: GardenPalette,
): Promise<GardenSceneLoadedAssets> {
  await ensurePixiAssetsInit()

  const aliases = Object.keys(
    GARDEN_SCENE_ASSET_URLS,
  ) as GardenSceneAssetAlias[]

  // Sequential load keeps Pixi Assets registration deterministic for ~20 SVGs.
  const texturesByAlias: Record<string, Texture> = {}
  const loadedAliases: string[] = []
  const missingAliases: string[] = []
  const failedUrls: string[] = []
  const fallbackAliases: string[] = []

  for (const alias of aliases) {
    const url = GARDEN_SCENE_ASSET_URLS[alias]
    try {
      const response = await fetch(url)
      if (!response.ok) {
        missingAliases.push(alias)
        failedUrls.push(url)
        fallbackAliases.push(alias)
        continue
      }
      const raw = await response.text()
      const baked = bakeSvgForPixi(raw, paletteFillForAlias(alias, palette))
      const dataUri = toDataUri(baked)
      // Unique alias per bake so remount/palette changes do not hit stale cache.
      const pixiAlias = `garden-scene:${alias}:${loadedAliases.length}`
      let texture: Texture | null = null
      // Flower heads use negative viewBoxes — prefer HTMLImageElement rasterisation.
      const preferImage = alias.startsWith("plant_head_") || alias.startsWith("face_")
      if (preferImage) {
        try {
          texture = await textureFromImage(dataUri)
        } catch {
          // Fall through to Pixi Assets.
        }
      }
      if (!texture) {
        try {
          Assets.add({ alias: pixiAlias, src: dataUri })
          const loaded = await Assets.load(pixiAlias)
          if (isTexture(loaded)) texture = loaded
        } catch {
          // Fall through to HTMLImageElement path.
        }
      }
      if (!texture) {
        try {
          texture = await textureFromImage(dataUri)
        } catch {
          missingAliases.push(alias)
          failedUrls.push(url)
          fallbackAliases.push(alias)
          continue
        }
      }
      if (!isTexture(texture)) {
        missingAliases.push(alias)
        failedUrls.push(url)
        fallbackAliases.push(alias)
        continue
      }
      texturesByAlias[alias] = texture
      loadedAliases.push(alias)
    } catch {
      missingAliases.push(alias)
      failedUrls.push(url)
      fallbackAliases.push(alias)
    }
  }

  const layers: LayerAssets = {
    sky: texturesByAlias.bg_sky_day,
    sun: texturesByAlias.bg_sun_glow,
    cloud01: texturesByAlias.bg_cloud_01,
    cloud02: texturesByAlias.bg_cloud_02,
    cloud03: texturesByAlias.bg_cloud_03,
    distantHills: texturesByAlias.bg_hill_back_01,
    distantBushes: texturesByAlias.bg_bush_back_01,
    midTrees: texturesByAlias.bg_tree_mid_01,
    fence: texturesByAlias.env_fence_white,
    grass: texturesByAlias.env_grass_base,
    grassDetail: texturesByAlias.env_grass_detail_01,
    soilPlots: texturesByAlias.env_soil_plot_01,
    foregroundLeafLeft: texturesByAlias.env_foreground_leaf_left,
    foregroundLeafRight: texturesByAlias.env_foreground_leaf_right,
    foregroundBush: texturesByAlias.env_foreground_bush_01,
  }

  const plantHeads: Partial<PlantHeadTextures> = {
    round: texturesByAlias.plant_head_round,
    bell: texturesByAlias.plant_head_bell,
    sun: texturesByAlias.plant_head_sun,
    tulip: texturesByAlias.plant_head_tulip,
    faceHappy: texturesByAlias.face_emote_happy,
  }

  const usedSpriteAliases = Object.entries({
    bg_sky_day: layers.sky,
    bg_sun_glow: layers.sun,
    bg_cloud_01: layers.cloud01,
    bg_cloud_02: layers.cloud02,
    bg_cloud_03: layers.cloud03,
    bg_hill_back_01: layers.distantHills,
    bg_bush_back_01: layers.distantBushes,
    bg_tree_mid_01: layers.midTrees,
    env_fence_white: layers.fence,
    env_grass_base: layers.grass,
    env_soil_plot_01: layers.soilPlots,
    env_foreground_leaf_left: layers.foregroundLeafLeft,
    env_foreground_leaf_right: layers.foregroundLeafRight,
    plant_head_round: plantHeads.round,
    plant_head_bell: plantHeads.bell,
    plant_head_sun: plantHeads.sun,
    plant_head_tulip: plantHeads.tulip,
  })
    .filter(([, tex]) => tex != null)
    .map(([alias]) => alias)

  const requiredMissing = GARDEN_SCENE_REQUIRED_ALIASES.filter(
    (a) => !loadedAliases.includes(a),
  )

  const diagnostics: GardenAssetDiagnostics = {
    requiredAliases: [...GARDEN_SCENE_REQUIRED_ALIASES],
    loadedAliases,
    missingAliases: requiredMissing.length > 0 ? requiredMissing : missingAliases,
    failedUrls,
    fallbackAliases,
    usedSpriteAliases,
  }

  return {
    layers,
    plantHeads,
    texturesByAlias,
    diagnostics,
    complete: requiredMissing.length === 0,
  }
}

/** Publish diagnostics for E2E / console probe (`gardenE2EProbe=1`). */
export function publishGardenAssetDiagnostics(
  diagnostics: GardenAssetDiagnostics,
): void {
  if (typeof window === "undefined") return
  try {
    Object.defineProperty(window, "__razzoozleGardenAssets", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: diagnostics,
    })
  } catch {
    // Non-configurable window in some test fakes.
    ;(window as Window & { __razzoozleGardenAssets?: GardenAssetDiagnostics })
      .__razzoozleGardenAssets = diagnostics
  }
}

export function clearGardenAssetDiagnostics(): void {
  if (typeof window === "undefined") return
  try {
    delete (window as Window & { __razzoozleGardenAssets?: unknown })
      .__razzoozleGardenAssets
  } catch {
    // ignore
  }
}
