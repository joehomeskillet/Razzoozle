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

import { Texture } from "pixi.js"

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

/** Shared body parts for asset-built team flowers (stem / leaf / pot). */
export interface PlantBodyTextures {
  stem?: Texture
  leaf?: Texture
  pot?: Texture
}

export interface GardenSceneLoadedAssets {
  layers: LayerAssets
  plantHeads: Partial<PlantHeadTextures>
  plantBody: PlantBodyTextures
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
    colors.accent ?? colors.fill,
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

export interface SvgViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

/** Parse the root SVG viewBox; returns null if missing/invalid. */
export function parseSvgViewBox(svg: string): SvgViewBox | null {
  const match = svg.match(
    /viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i,
  )
  if (!match) return null
  const minX = Number(match[1])
  const minY = Number(match[2])
  const width = Number(match[3])
  const height = Number(match[4])
  if (
    ![minX, minY, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { minX, minY, width, height }
}

/**
 * Rewrite `viewBox="minX minY w h"` with negative minX/minY into a positive
 * box and wrap children in a compensating translate. Negative-origin SVGs
 * often decode as blank/black bitmaps in Chromium Image + Pixi paths.
 */
export function normalizeSvgViewBox(svg: string): string {
  const vb = parseSvgViewBox(svg)
  if (!vb) return svg
  if (vb.minX >= 0 && vb.minY >= 0) return svg

  let out = svg.replace(
    /viewBox\s*=\s*["'][^"']*["']/i,
    `viewBox="0 0 ${vb.width} ${vb.height}"`,
  )
  out = out.replace(
    /(<svg\b[^>]*>)/i,
    `$1<g transform="translate(${-vb.minX} ${-vb.minY})">`,
  )
  out = out.replace(/<\/svg>\s*$/i, "</g></svg>")
  return out
}

/**
 * Force explicit width/height on the root <svg>. Without them, Chromium
 * often decodes SVGs as the 300×150 default → massive upscale + pixelation.
 */
export function ensureSvgIntrinsicSize(
  svg: string,
  width: number,
  height: number,
): string {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  return svg.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let next = attrs
      .replace(/\swidth\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\sheight\s*=\s*["'][^"']*["']/gi, "")
    return `<svg${next} width="${w}" height="${h}">`
  })
}

/**
 * Choose canvas pixel size for an alias from its viewBox.
 * Full-width layers stay at design resolution; small props are 2× supersampled.
 */
export function targetRasterSize(
  alias: GardenSceneAssetAlias,
  vb: SvgViewBox,
): { width: number; height: number } {
  const isHead = alias.startsWith("plant_head_") || alias.startsWith("face_")
  if (isHead) {
    return { width: 512, height: 512 }
  }

  // Stems + pots: high-DPI rasters at minimum 256×512 (WP-7). Slight aspect
  // stretch is acceptable — the source SVG is vector and the rasterization
  // runs at full canvas pixel resolution. Leaves are smaller details;
  // preserve aspect, floor short side at 256, cap long side at 512.
  if (alias === "plant_stem_01" || alias === "plant_pot_01") {
    return { width: 256, height: 512 }
  }
  if (alias === "plant_leaf_01") {
    const minShortSide = 256
    const maxLongSide = 512
    const targetWidth = Math.min(maxLongSide, Math.max(minShortSide, vb.width))
    const targetHeight = Math.round((vb.height / vb.width) * targetWidth)
    if (targetHeight > maxLongSide) {
      return { width: minShortSide, height: minShortSide }
    }
    return {
      width: targetWidth,
      height: Math.max(targetHeight, 1),
    }
  }

  // Wide stage strips (sky/hills/fence/lawn/trees): keep design pixels.
  if (vb.width >= 960) {
    const maxSide = 2048
    if (vb.width <= maxSide && vb.height <= maxSide) {
      return { width: Math.round(vb.width), height: Math.round(vb.height) }
    }
    const s = maxSide / Math.max(vb.width, vb.height)
    return {
      width: Math.round(vb.width * s),
      height: Math.round(vb.height * s),
    }
  }

  // Clouds, tufts, soil mounds, leaves: 2× supersample for crisp scale-up.
  const scale = 2
  return {
    width: Math.round(vb.width * scale),
    height: Math.round(vb.height * scale),
  }
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

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = "async"
  img.crossOrigin = "anonymous"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Image decode failed"))
    img.src = src
  })
  return img
}

/**
 * True for PNG/JPEG sources — including Vite-inlined `data:image/png;base64,…`
 * URLs. The old `\.png($|?)` check missed data-URIs, so production builds
 * (which inline small Kenney props) treated rasters as SVG text, bake failed,
 * and sun/clouds/trees were reported missing while SVGs still loaded.
 */
export function isRasterUrl(url: string): boolean {
  if (/^data:image\/(png|jpe?g)\b/i.test(url)) return true
  return /\.png(\?|#|$)/i.test(url) || /\.jpe?g(\?|#|$)/i.test(url)
}

/**
 * Load a PNG/JPEG URL into a Pixi Texture, 2× upscaling small sources so
 * mid-ground props (Kenney trees ~128px) stay soft rather than blocky.
 */
export async function loadRasterTexture(
  url: string,
  _alias: GardenSceneAssetAlias,
): Promise<Texture> {
  const img = await loadHtmlImage(url)
  const iw = Math.max(1, img.naturalWidth || 64)
  const ih = Math.max(1, img.naturalHeight || 64)
  const maxSide = Math.max(iw, ih)
  // Upscale tiny props; keep large sample plates (1024) as-is.
  const upscale = maxSide < 512 ? 2 : 1
  const canvas = document.createElement("canvas")
  canvas.width = iw * upscale
  canvas.height = ih * upscale
  const ctx = canvas.getContext("2d")
  if (!ctx) return Texture.from(img)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const texture = Texture.from(canvas)
  try {
    texture.source.scaleMode = "linear"
  } catch {
    // ignore
  }
  return texture
}

/**
 * High-quality SVG → Canvas2D → Pixi Texture path used for every garden
 * asset. Always preserves aspect ratio and uses viewBox-sized pixels so
 * stage strips are sharp at 1920 logical width (no 300×150 default).
 */
export async function rasterizeSvgToTexture(
  bakedSvg: string,
  alias: GardenSceneAssetAlias,
): Promise<Texture> {
  const vb =
    parseSvgViewBox(bakedSvg) ??
    ({ minX: 0, minY: 0, width: 256, height: 256 } satisfies SvgViewBox)
  const target = targetRasterSize(alias, vb)
  // Tell the browser the intrinsic pixel size before decode.
  const sized = ensureSvgIntrinsicSize(bakedSvg, target.width, target.height)
  const dataUri = toDataUri(sized)
  const img = await loadHtmlImage(dataUri)

  const canvas = document.createElement("canvas")
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    const fallback = Texture.from(img)
    return fallback
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.clearRect(0, 0, target.width, target.height)

  // Heads: contain-fit into square. Everything else: stretch to target
  // (target already matches aspect of viewBox).
  if (alias.startsWith("plant_head_") || alias.startsWith("face_")) {
    const iw = img.naturalWidth || target.width
    const ih = img.naturalHeight || target.height
    const s = Math.min(target.width / iw, target.height / ih)
    const dw = iw * s
    const dh = ih * s
    ctx.drawImage(
      img,
      (target.width - dw) / 2,
      (target.height - dh) / 2,
      dw,
      dh,
    )
  } else {
    ctx.drawImage(img, 0, 0, target.width, target.height)
  }

  const texture = Texture.from(canvas)
  // Prefer smooth filtering when the sprite is scaled on screen.
  try {
    texture.source.scaleMode = "linear"
  } catch {
    // Older pixi texture sources may not expose scaleMode — ignore.
  }
  return texture
}

function paletteFillForAlias(
  alias: GardenSceneAssetAlias,
  palette: GardenPalette,
): { fill: string; ink: string; accent: string } {
  const ink = hexToCssColor(palette.plantStem)
  const accent = hexToCssColor(palette.sun)

  // Plant heads are team-tinted via Pixi Sprite.tint (multiply). Bake:
  //   fill   = white petals (currentColor)
  //   accent = soft cream centre (was sun yellow via --status-pending-bg)
  //   ink    = dark face lines (eyes/smile)
  // Never bake the sun colour into heads — it washed every team to yellow.
  if (alias.startsWith("plant_head_") || alias.startsWith("face_")) {
    // Soft cream centre (0xfff3c8) multiplies cleanly with team tint.
    return {
      fill: hexToCssColor(0xffffff),
      ink: hexToCssColor(palette.teamMeterFrame),
      accent: hexToCssColor(0xfff3c8),
    }
  }
  // Stem / leaf / pot: white body for runtime tint; pot soil lip = accent.
  if (
    alias === "plant_stem_01" ||
    alias === "plant_leaf_01" ||
    alias === "plant_pot_01"
  ) {
    return {
      fill: hexToCssColor(0xffffff),
      ink: hexToCssColor(palette.teamMeterFrame),
      accent: hexToCssColor(palette.soil),
    }
  }

  const map: Record<GardenSceneAssetAlias, number> = {
    bg_sky_day: palette.sky,
    bg_sun_glow: palette.sun,
    bg_cloud_01: palette.cloud,
    bg_cloud_02: palette.cloud,
    bg_cloud_03: palette.cloud,
    bg_cloud_04: palette.cloud,
    bg_hill_back_01: palette.hillBack,
    bg_bush_back_01: palette.bushBack,
    bg_tree_mid_01: palette.midground,
    bg_tree_02: palette.midground,
    bg_tree_03: palette.foreground,
    bg_tree_04: palette.midground,
    bg_tree_05: palette.foreground,
    bg_tree_06: palette.midground,
    env_fence_white: palette.fence,
    env_grass_base: palette.grass,
    env_grass_detail_01: palette.foreground,
    env_grass_detail_02: palette.foreground,
    env_grass_detail_03: palette.foreground,
    env_soil_plot_01: palette.soil,
    env_foreground_leaf_left: palette.foreground,
    env_foreground_leaf_right: palette.foreground,
    env_foreground_bush_01: palette.bushMid,
    // Unreachable for plant/face aliases (early return above) — kept for exhaustiveness.
    plant_head_round: 0xffffff,
    plant_head_bell: 0xffffff,
    plant_head_sun: 0xffffff,
    plant_head_tulip: 0xffffff,
    face_emote_happy: 0xffffff,
    plant_stem_01: 0xffffff,
    plant_leaf_01: 0xffffff,
    plant_pot_01: 0xffffff,
  }
  return {
    fill: hexToCssColor(map[alias]),
    ink,
    accent,
  }
}

/**
 * Load every garden-scene production SVG, bake colours, return typed maps.
 * Safe to call once per attach; concurrent callers should share externally.
 */
export async function loadGardenSceneAssets(
  palette: GardenPalette,
): Promise<GardenSceneLoadedAssets> {
  const aliases = Object.keys(
    GARDEN_SCENE_ASSET_URLS,
  ) as GardenSceneAssetAlias[]

  // Sequential load keeps memory + main-thread rasterisation predictable.
  const texturesByAlias: Record<string, Texture> = {}
  const loadedAliases: string[] = []
  const missingAliases: string[] = []
  const failedUrls: string[] = []
  const fallbackAliases: string[] = []

  for (const alias of aliases) {
    const url = GARDEN_SCENE_ASSET_URLS[alias]
    try {
      let texture: Texture
      if (isRasterUrl(url)) {
        texture = await loadRasterTexture(url, alias)
      } else {
        const response = await fetch(url)
        if (!response.ok) {
          missingAliases.push(alias)
          failedUrls.push(url)
          fallbackAliases.push(alias)
          continue
        }
        const raw = await response.text()
        const baked = bakeSvgForPixi(raw, paletteFillForAlias(alias, palette))
        texture = await rasterizeSvgToTexture(baked, alias)
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

  const trees = [
    texturesByAlias.bg_tree_mid_01,
    texturesByAlias.bg_tree_02,
    texturesByAlias.bg_tree_03,
    texturesByAlias.bg_tree_04,
    texturesByAlias.bg_tree_05,
    texturesByAlias.bg_tree_06,
  ].filter((t): t is Texture => t != null)

  const grassDetails = [
    texturesByAlias.env_grass_detail_01,
    texturesByAlias.env_grass_detail_02,
    texturesByAlias.env_grass_detail_03,
  ].filter((t): t is Texture => t != null)

  const layers: LayerAssets = {
    sky: texturesByAlias.bg_sky_day,
    sun: texturesByAlias.bg_sun_glow,
    cloud01: texturesByAlias.bg_cloud_01,
    cloud02: texturesByAlias.bg_cloud_02,
    cloud03: texturesByAlias.bg_cloud_03,
    cloud04: texturesByAlias.bg_cloud_04,
    distantHills: texturesByAlias.bg_hill_back_01,
    distantBushes: texturesByAlias.bg_bush_back_01,
    midTrees: texturesByAlias.bg_tree_mid_01,
    trees,
    fence: texturesByAlias.env_fence_white,
    grass: texturesByAlias.env_grass_base,
    grassDetail: texturesByAlias.env_grass_detail_01,
    grassDetails,
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

  const plantBody: PlantBodyTextures = {
    stem: texturesByAlias.plant_stem_01,
    leaf: texturesByAlias.plant_leaf_01,
    pot: texturesByAlias.plant_pot_01,
  }

  const usedSpriteAliases = Object.entries({
    bg_sky_day: layers.sky,
    bg_sun_glow: layers.sun,
    bg_cloud_01: layers.cloud01,
    bg_cloud_02: layers.cloud02,
    bg_cloud_03: layers.cloud03,
    bg_cloud_04: layers.cloud04,
    bg_hill_back_01: layers.distantHills,
    bg_bush_back_01: layers.distantBushes,
    bg_tree_mid_01: layers.midTrees,
    bg_tree_02: texturesByAlias.bg_tree_02,
    bg_tree_03: texturesByAlias.bg_tree_03,
    env_fence_white: layers.fence,
    env_grass_base: layers.grass,
    env_soil_plot_01: layers.soilPlots,
    env_foreground_leaf_left: layers.foregroundLeafLeft,
    env_foreground_leaf_right: layers.foregroundLeafRight,
    plant_head_round: plantHeads.round,
    plant_head_bell: plantHeads.bell,
    plant_head_sun: plantHeads.sun,
    plant_head_tulip: plantHeads.tulip,
    face_emote_happy: plantHeads.faceHappy,
    plant_stem_01: plantBody.stem,
    plant_leaf_01: plantBody.leaf,
    plant_pot_01: plantBody.pot,
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
    plantBody,
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
