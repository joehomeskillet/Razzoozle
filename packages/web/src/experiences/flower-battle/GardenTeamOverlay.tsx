/**
 * GardenTeamOverlay — DOM overlay of `PlantTeamCard`s on top of the PixiJS
 * garden canvas. Anchored via the PixiJS scene's `getPlotAnchors()` so the
 * cards sit directly under the matching plant even when the canvas itself
 * is letterboxed.
 *
 * Why: FB-HUD5 spec is `PlantTeamCard directly under the plant`. Earlier
 * iterations derived positions from `getTeamSlotLayout()`, which used a
 * different margin/gap contract than `computePlotAnchors()` and therefore
 * misaligned the cards relative to the rendered plants. Reading the live
 * scene's anchors (with a deterministic `computePlotAnchors()` + letterbox
 * fallback when the scene isn't ready yet) keeps both layers in lock-step
 * through every resize and reveal.
 *
 * Layer model:
 *  - z-10 above the canvas (z-0) but below the experience HUD chrome.
 *  - pointer-events-none on the wrapper, pointer-events-auto on the
 *    card so the scene drag/zoom (if any) keeps working.
 *  - plant-anchor coordinates are converted to a percentage box via the
 *    scene's own letterbox transform, so the overlay survives viewport
 *    resizes without drift between DOM and PixiJS.
 */

import { useEffect, useMemo, useRef } from "react"

import { computePlotAnchors, type PlotAnchor } from "./rendering/plotAnchors"
import {
  fitLogicalViewport,
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
  type LetterboxTransform,
} from "./rendering/gardenViewport"
import { PlantTeamCard, plantTeamCardPropsFromTeam } from "./PlantTeamCard"
import { useGardenPixiApplication } from "./GardenBattleCanvasHost"
import type { GardenScene } from "./garden-pixi.types"
import type { FlowerBattleTeamState } from "./flower-battle-scene.types"

/**
 * Subset of the procedural `GardenScene` that exposes the live plot-anchor
 * + letterbox contract. `GardenScene` deliberately hides these so unit-test
 * fakes can omit them; the overlay narrows via this structural type so the
 * live procedural scene path type-checks without leaking methods onto the
 * public scene contract.
 */
interface SceneWithAnchors {
  getPlotAnchors(): readonly PlotAnchor[]
  getLetterbox(): LetterboxTransform | null
}

const hasSceneAnchors = (
  scene: GardenScene | null,
): scene is GardenScene & SceneWithAnchors =>
  scene !== null &&
  typeof (scene as Partial<SceneWithAnchors>).getPlotAnchors === "function" &&
  typeof (scene as Partial<SceneWithAnchors>).getLetterbox === "function"

interface TeamSlotViewport {
  width: number
  height: number
}

export interface GardenTeamOverlayProps {
  teams: readonly FlowerBattleTeamState[]
  viewport: TeamSlotViewport
}

interface AnchorScreen {
  /** Horizontal centre of the card box, 0..100 (% of host width). */
  xPercent: number
  /** Soil line — top edge of the card box, 0..100 (% of host height). */
  yPercent: number
}

const toPercent = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0

const clampPercent = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min

const OVERLAY_CARD_WIDTH_PERCENT = 14
const OVERLAY_CARD_MIN_HEIGHT_PERCENT = 10
const OVERLAY_CARD_BOTTOM_INSET_PERCENT = 1
const FALLBACK_VIEWPORT: TeamSlotViewport = { width: 1024, height: 768 }

/**
 * Project a logical anchor through the given letterbox into host-space
 * percentages. Same arithmetic for the live scene path and the
 * `computePlotAnchors()` fallback — they must agree byte-for-byte so a
 * single render never shifts the card sideways between an isReady false
 * frame and an isReady true frame.
 */
const projectAnchor = (
  anchor: PlotAnchor,
  letterbox: LetterboxTransform,
  hostWidth: number,
  hostHeight: number,
): AnchorScreen => {
  const screenX = anchor.x * letterbox.scale + letterbox.offsetX
  const screenY = anchor.y * letterbox.scale + letterbox.offsetY
  return {
    xPercent: hostWidth > 0 ? toPercent((screenX / hostWidth) * 100) : 50,
    yPercent: hostHeight > 0 ? toPercent((screenY / hostHeight) * 100) : 80,
  }
}

/**
 * GardenTeamOverlay — one card per active team, anchored horizontally at
 * the matching PixiJS plot anchor (live scene path) or the deterministic
 * `computePlotAnchors()` fallback (pre-ready / static-fallback path).
 */
export const GardenTeamOverlay = ({
  teams,
  viewport,
}: GardenTeamOverlayProps) => {
  const { scene } = useGardenPixiApplication()
  const hostWidth = viewport.width
  const hostHeight = viewport.height
  const viewportFallbackRef = useRef<TeamSlotViewport>(FALLBACK_VIEWPORT)
  const lastAnchorScreensRef = useRef<AnchorScreen[]>([])

  const hostViewport = useMemo<TeamSlotViewport>(() => {
    if (hostWidth > 0 && hostHeight > 0) {
      viewportFallbackRef.current = {
        width: hostWidth,
        height: hostHeight,
      }
      return { width: hostWidth, height: hostHeight }
    }
    return viewportFallbackRef.current
  }, [hostWidth, hostHeight])

  const fallbackAnchorScreens = useMemo<AnchorScreen[]>(() => {
    if (teams.length === 0) return []
    const effectiveWidth = hostViewport.width
    const effectiveHeight = hostViewport.height
    if (effectiveWidth <= 0 || effectiveHeight <= 0) return []

    const fallbackAnchors = computePlotAnchors(
      teams.length,
      GARDEN_LOGICAL_WIDTH,
      GARDEN_LOGICAL_HEIGHT,
    )
    const fallbackLetterbox = fitLogicalViewport(
      effectiveWidth,
      effectiveHeight,
      GARDEN_LOGICAL_WIDTH,
      GARDEN_LOGICAL_HEIGHT,
    )

    return fallbackAnchors
      .slice(0, teams.length)
      .map((anchor) =>
        projectAnchor(anchor, fallbackLetterbox, effectiveWidth, effectiveHeight),
      )
  }, [teams.length, hostViewport.width, hostViewport.height])

  const anchorScreens = useMemo<AnchorScreen[]>(() => {
    if (teams.length === 0) return []
    const effectiveWidth = hostViewport.width
    const effectiveHeight = hostViewport.height
    if (effectiveWidth <= 0 || effectiveHeight <= 0) return []

    const screens = fallbackAnchorScreens.slice()

    // Live-scene path: pull the exact anchors and letterbox the procedural
    // scene already computed, so the overlay is bit-identical to the plants
    // the renderer is painting this frame.
    if (hasSceneAnchors(scene)) {
      const sceneLetterbox = scene.getLetterbox()
      if (sceneLetterbox && sceneLetterbox.scale > 0) {
        const sceneAnchors = scene.getPlotAnchors()
        for (let index = 0; index < teams.length; index += 1) {
          const sceneAnchor = sceneAnchors[index]
          if (!sceneAnchor) continue
          screens[index] = projectAnchor(
            sceneAnchor,
            sceneLetterbox,
            effectiveWidth,
            effectiveHeight,
          )
        }
        return screens
      }
    }

    return screens
  }, [scene, teams.length, hostViewport.width, hostViewport.height, fallbackAnchorScreens])

  const resolvedAnchorScreens = anchorScreens.length
    ? anchorScreens
    : lastAnchorScreensRef.current

  useEffect(() => {
    if (resolvedAnchorScreens.length > 0) {
      lastAnchorScreensRef.current = resolvedAnchorScreens
    }
  }, [resolvedAnchorScreens])

  if (teams.length === 0) return null

  return (
    <div
      data-testid="garden-team-overlay"
      aria-hidden="false"
      className="pointer-events-none absolute inset-0 z-10"
    >
      {teams.map((team, index) => {
        const screen = resolvedAnchorScreens[index]
        if (!screen) return null
        const cardProps = plantTeamCardPropsFromTeam(team, index)
        // Card box: horizontally centred on the plant anchor, vertically
        // starts at the soil line and extends down to a small bottom inset
        // (mirrors the `pb-2` the static fallback uses).
        const cardLeftPercent = clampPercent(
          screen.xPercent - OVERLAY_CARD_WIDTH_PERCENT / 2,
          0,
          100 - OVERLAY_CARD_WIDTH_PERCENT,
        )
        const cardTopPercent = clampPercent(
          screen.yPercent,
          0,
          100 -
            OVERLAY_CARD_BOTTOM_INSET_PERCENT -
            OVERLAY_CARD_MIN_HEIGHT_PERCENT,
        )
        return (
          <div
            key={`garden-team-overlay-${index}`}
            data-testid={`garden-team-overlay-slot-${index}`}
            data-team-name={team.name}
            className="pointer-events-none absolute flex items-end justify-center"
            style={{
              left: `${cardLeftPercent}%`,
              top: `${cardTopPercent}%`,
              width: `${OVERLAY_CARD_WIDTH_PERCENT}%`,
              height: `calc(${100 - cardTopPercent - OVERLAY_CARD_BOTTOM_INSET_PERCENT}% )`,
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
