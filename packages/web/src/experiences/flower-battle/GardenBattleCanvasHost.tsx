/**
 * GardenBattleCanvasHost — PixiJS Application lifecycle shell for the Flower
 * Battle presenter scene (WP-02 / WP-PIX-05B / ADR-013).
 *
 * Owns mount/resize/visibility/destroy and live roster snapshots into the
 * procedural garden scene. Default createScene is createGardenScene; quality
 * "static" or init errors fall back to FlowerGardenScene. Does NOT own asset
 * loading (WP-03).
 *
 * Also hosts the FlowerEventBubble overlay (WP-D-2 / SDD §20.5): subscribes to
 * the S2C `game:flowerBattle:powerupApplied` envelope, surfaces a transient
 * comic speech bubble in the safe area, and clears it on auto-dismiss or
 * replacement.
 */

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react"
import type { Application } from "pixi.js"

import { EVENTS } from "@razzoozle/common/constants"
import { collectGardenExperienceLayoutDiagnostics } from "./experienceLayoutDiagnostics"
import type { PowerupApplied } from "@razzoozle/common/types/game/socket"
import { useEvent } from "@razzoozle/web/features/game/contexts/socket-context"

import { CURRENT_GARDEN_RECIPE_VERSION } from "./background"
import {
  attachGardenPixiApplication,
  type AttachGardenPixiOptions,
  type GardenPixiEnvironment,
} from "./attachGardenPixiApplication"
import {
  FlowerEventBubble,
  type FlowerEventBubbleEvent,
} from "./FlowerEventBubble"
import { FlowerGardenScene } from "./FlowerGardenScene"
import type {
  GardenBattleCanvasHostProps,
  GardenE2EProbeHandle,
  GardenPixiHookValue,
  GardenRenderQuality,
  GardenScene,
} from "./garden-pixi.types"

/** URLSearchParams flag that enables the canvas-local E2E identity probe. */
const GARDEN_E2E_PROBE_PARAM = "gardenE2EProbe"

/** Non-enumerable property name attached to the host canvas only. */
const GARDEN_E2E_PROBE_PROPERTY = "__razzoozleGardenE2E"

function isGardenE2EProbeEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (
      new URLSearchParams(window.location.search).get(
        GARDEN_E2E_PROBE_PARAM,
      ) === "1"
    )
  } catch {
    return false
  }
}

function clearGardenE2EProbe(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return
  if (!Object.hasOwn(canvas, GARDEN_E2E_PROBE_PROPERTY)) {
    return
  }
  // configurable:true allows synchronous delete on dispose/unmount.
  delete (
    canvas as HTMLCanvasElement & {
      [GARDEN_E2E_PROBE_PROPERTY]?: GardenE2EProbeHandle
    }
  )[GARDEN_E2E_PROBE_PROPERTY]
}

function wrapGardenDisposeWithProbeClear(
  canvas: HTMLCanvasElement,
  dispose: () => void,
): () => void {
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    clearGardenE2EProbe(canvas)
    dispose()
  }
}

function publishGardenE2EProbe(
  canvas: HTMLCanvasElement,
  scene: GardenScene,
): void {
  if (typeof scene.getE2EIdentity !== "function") return

  const sceneRef: { current: GardenScene } = { current: scene }
  const handle: GardenE2EProbeHandle = {
    getE2EIdentity: () => {
      const current = sceneRef.current
      if (typeof current.getE2EIdentity !== "function") {
        throw new Error("Garden E2E probe scene unavailable")
      }
      return current.getE2EIdentity()
    },
  }
  if (typeof scene.getLayoutDiagnostics === "function") {
    handle.getLayoutDiagnostics = () => {
      const current = sceneRef.current
      if (typeof current.getLayoutDiagnostics !== "function") {
        throw new Error("Garden layout diagnostics scene unavailable")
      }
      return current.getLayoutDiagnostics()
    }
  }
  handle.getExperienceLayoutDiagnostics = () =>
    collectGardenExperienceLayoutDiagnostics(canvas)

  Object.defineProperty(canvas, GARDEN_E2E_PROBE_PROPERTY, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: handle,
  })
}

const GardenPixiContext = createContext<GardenPixiHookValue>({
  app: null,
  isReady: false,
  error: null,
  scene: null,
})

/**
 * Access the live Pixi Application / scene from a descendant of
 * GardenBattleCanvasHost. Outside the host tree returns the idle defaults.
 */
export function useGardenPixiApplication(): GardenPixiHookValue {
  return useContext(GardenPixiContext)
}

export type { GardenBattleCanvasHostProps, GardenRenderQuality }

/** Resolve quality: static wins; reduced-motion demotes high → low. */
export function resolveGardenRenderQuality(
  quality: GardenRenderQuality | undefined,
  prefersReducedMotion: boolean,
): GardenRenderQuality {
  const requested = quality ?? "high"
  if (requested === "static") return "static"
  if (prefersReducedMotion && requested === "high") return "low"
  return requested
}

function readPrefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Format a non-Error Pixi init rejection without Object default stringification
 * (`[object Object]`), which oxlint no-base-to-string rejects.
 */
function formatUnknownPixiInitError(caught: unknown): string {
  if (caught == null) return "PixiJS init failed"
  if (typeof caught === "string") return caught
  if (
    typeof caught === "number" ||
    typeof caught === "boolean" ||
    typeof caught === "bigint"
  ) {
    return String(caught)
  }
  if (typeof caught === "symbol") {
    return caught.description ?? "PixiJS init failed"
  }
  try {
    const json = JSON.stringify(caught)
    if (typeof json === "string") return json
  } catch {
    // Circular / non-serializable values fall through.
  }
  return "PixiJS init failed"
}

interface StaticFallbackProps {
  teams: GardenBattleCanvasHostProps["teams"]
  seed?: number | string
  recipeVersion?: number | string
  fallback?: ReactNode
  reason: "static" | "error"
  errorMessage?: string
}

function GardenStaticFallback({
  teams,
  seed = 0,
  recipeVersion = CURRENT_GARDEN_RECIPE_VERSION,
  fallback,
  reason,
  errorMessage,
}: StaticFallbackProps) {
  return (
    <div
      data-testid="garden-static-fallback"
      data-fallback-reason={reason}
      className="bg-surface relative h-full w-full overflow-hidden"
      role="region"
      aria-label="Flower Battle garden scene (static)"
    >
      <div
        id="garden-status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {reason === "error"
          ? `Garden scene unavailable${errorMessage ? `: ${errorMessage}` : ""}`
          : "Garden scene static view"}
      </div>
      {fallback ?? (
        <FlowerGardenScene
          seed={seed}
          recipeVersion={recipeVersion}
          teams={teams}
        />
      )}
    </div>
  )
}

interface LocalErrorBoundaryProps {
  children: ReactNode
  onError?: (error: Error) => void
  fallback: (error: Error) => ReactNode
}

interface LocalErrorBoundaryState {
  error: Error | null
}

/**
 * Narrow error boundary: catches render failures around the canvas subtree
 * and shows the static garden fallback without navigating away.
 */
class GardenCanvasErrorBoundary extends Component<
  LocalErrorBoundaryProps,
  LocalErrorBoundaryState
> {
  state: LocalErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): LocalErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError?.(error)
  }

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error)
    }
    return this.props.children
  }
}

export interface GardenBattleCanvasHostInternalProps extends GardenBattleCanvasHostProps {
  /** Test-only: inject attach options (Application/scene factories). */
  attachOptions?: AttachGardenPixiOptions
  /** Test-only: inject browser environment for attach. */
  environment?: GardenPixiEnvironment
}

/**
 * Map a POWERUP_APPLIED envelope to the minimal presenter bubble payload. Drops
 * the gameId, targetTeamId, and applied-result kind (presenter doesn't need
 * scoring detail; the source team is the headline actor).
 */
const toBubbleEvent = (payload: PowerupApplied): FlowerEventBubbleEvent | null => {
  if (!payload || typeof payload.sourceTeamId !== "string") return null
  return {
    teamId: payload.sourceTeamId,
    powerupType: payload.optionId as FlowerEventBubbleEvent["powerupType"],
    issuedAtServerMs: Date.now(),
  }
}

/**
 * React host for the Pixi garden canvas. Default quality path initializes
 * PixiJS; `quality="static"` or init errors fall back to FlowerGardenScene.
 */
export function GardenBattleCanvasHost({
  teams,
  quality,
  onReady,
  onError,
  className = "",
  seed,
  recipeVersion,
  phase,
  fallback,
  attachOptions,
  environment,
}: GardenBattleCanvasHostInternalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const disposeRef = useRef<(() => void) | undefined>(undefined)
  const [app, setApp] = useState<Application | null>(null)
  const [scene, setScene] = useState<GardenScene | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // WP-D-2: transient presenter event surfaced as a comic speech bubble
  // (SDD §20.5). Replaced on every POWERUP_APPLIED, cleared on auto-dismiss.
  const [currentEvent, setCurrentEvent] = useState<FlowerEventBubbleEvent | null>(null)

  const prefersReducedMotion = useMemo(() => readPrefersReducedMotion(), [])
  const effectiveQuality = resolveGardenRenderQuality(
    quality,
    prefersReducedMotion,
  )
  const useStatic = effectiveQuality === "static" || error !== null
  const e2eProbeEnabled = isGardenE2EProbeEnabled()

  // Stable callback / inject refs so parent re-renders never re-init Pixi
  // solely due to attachOptions/environment object identity (WP-PIX-05B).
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  const attachOptionsRef = useRef(attachOptions)
  const environmentRef = useRef(environment)
  onReadyRef.current = onReady
  onErrorRef.current = onError
  attachOptionsRef.current = attachOptions
  environmentRef.current = environment

  const dismissBubble = useCallback(() => {
    setCurrentEvent(null)
  }, [])

  // WP-D-2: subscribe to POWERUP_APPLIED so the bubble replaces the prior event
  // (no stacking per SDD §20.5). Guarded against null payloads defensively.
  useEvent(EVENTS.FLOWER_BATTLE.POWERUP_APPLIED, (payload) => {
    const next = toBubbleEvent(payload)
    if (next) setCurrentEvent(next)
  })

  const disposeCurrentGarden = useCallback(
    (canvas: HTMLCanvasElement | null): void => {
      const dispose = disposeRef.current
      disposeRef.current = undefined
      clearGardenE2EProbe(canvas)
      dispose?.()
    },
    [],
  )

  useEffect(() => {
    if (effectiveQuality === "static") {
      disposeCurrentGarden(canvasRef.current)
      setApp(null)
      setScene(null)
      setIsReady(false)
      setError(null)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    void (async () => {
      try {
        const inject = attachOptionsRef.current
        const result = await attachGardenPixiApplication(
          canvas,
          {
            ...inject,
            onReady: (handle, nextScene) => {
              inject?.onReady?.(handle, nextScene)
              if (cancelled) return
              // Production Application satisfies GardenPixiApplicationHandle.
              const pixiApp = handle as unknown as Application
              setApp(pixiApp)
              setScene(nextScene)
              setIsReady(true)
              setError(null)
              onReadyRef.current?.(pixiApp)
            },
          },
          environmentRef.current,
        )

        const dispose = wrapGardenDisposeWithProbeClear(canvas, result.dispose)
        if (cancelled) {
          dispose()
          return
        }
        disposeRef.current = dispose
      } catch (caught) {
        if (cancelled) {
          clearGardenE2EProbe(canvas)
          return
        }
        disposeCurrentGarden(canvas)
        setApp(null)
        setScene(null)
        setIsReady(false)
        const nextError =
          caught instanceof Error
            ? caught
            : new Error(formatUnknownPixiInitError(caught))
        setError(nextError)
        onErrorRef.current?.(nextError)
      }
    })()

    return () => {
      cancelled = true
      disposeCurrentGarden(canvas)
      // Avoid setState-after-unmount; next mount starts from idle defaults.
    }
    // attachOptions / environment read via refs — identity must not reattach.
  }, [effectiveQuality, disposeCurrentGarden])

  // Push live roster + phase into the same scene instance (no remount).
  useEffect(() => {
    if (!scene || typeof scene.updateSnapshot !== "function") return
    scene.updateSnapshot({
      teams: teams.map((team) => ({
        name: team.name,
        growthStage: team.growthStage,
      })),
      phase,
    })
  }, [scene, teams, phase])

  // Guarded canvas-local E2E identity probe (no window global).
  // Only when `?gardenE2EProbe=1` and a real scene exposes getE2EIdentity.
  useEffect(() => {
    if (useStatic || !isReady || !e2eProbeEnabled) {
      clearGardenE2EProbe(canvasRef.current)
      return
    }
    const canvas = canvasRef.current
    if (!canvas || !scene || typeof scene.getE2EIdentity !== "function") {
      clearGardenE2EProbe(canvas)
      return
    }

    publishGardenE2EProbe(canvas, scene)
    return () => {
      clearGardenE2EProbe(canvas)
    }
  }, [scene, isReady, useStatic, e2eProbeEnabled])

  const contextValue = useMemo<GardenPixiHookValue>(
    () => ({ app, isReady, error, scene }),
    [app, isReady, error, scene],
  )

  const staticNode = (
    <GardenStaticFallback
      teams={teams}
      seed={seed}
      recipeVersion={recipeVersion}
      fallback={fallback}
      reason={error ? "error" : "static"}
      errorMessage={error?.message}
    />
  )

  return (
    <GardenPixiContext.Provider value={contextValue}>
      <GardenCanvasErrorBoundary
        onError={(boundaryError) => {
          disposeCurrentGarden(canvasRef.current)
          setApp(null)
          setScene(null)
          setIsReady(false)
          setError(boundaryError)
          onErrorRef.current?.(boundaryError)
        }}
        fallback={(boundaryError) => (
          <GardenStaticFallback
            teams={teams}
            seed={seed}
            recipeVersion={recipeVersion}
            fallback={fallback}
            reason="error"
            errorMessage={boundaryError.message}
          />
        )}
      >
        <div
          data-testid="garden-battle-canvas-host"
          data-quality={effectiveQuality}
          data-ready={isReady ? "true" : "false"}
          data-reduced-motion={prefersReducedMotion ? "true" : "false"}
          data-seed={seed ?? 0}
          data-recipe-version={recipeVersion ?? CURRENT_GARDEN_RECIPE_VERSION}
          data-phase={phase ?? ""}
          className={`relative h-full min-h-0 w-full overflow-hidden ${className}`.trim()}
        >
          {useStatic ? (
            staticNode
          ) : (
            <>
              {/*
                WP3 (FB-HUD-WP3) — Canvas-HUD render-path hygiene:
                `block h-full w-full` only — no `transform`, no `filter`, no
                `backdrop-filter`, no `will-change: transform`. Anything that
                promotes the canvas into a compositor layer with a sub-pixel
                transform re-samples the WebGL bitmap bilinearly and re-introduces
                the blur the renderer fix (fractional canvas size + DPR-conformant
                resolution) just removed. Size comes from CSS box layout; Pixi
                keeps the canvas pixel-aligned via the values it sets on
                `canvas.style.{width,height}`.
              */}
              <canvas
                ref={canvasRef}
                data-testid="garden-pixi-canvas"
                role="region"
                aria-label="Flower Battle garden scene"
                aria-describedby="garden-status"
                className="block h-full w-full"
              />
              <div
                id="garden-status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
              >
                {isReady ? "Garden scene ready" : "Garden scene loading"}
              </div>
              {/* WP-D-2: transient comic speech bubble for power-up events
                  (SDD §20.5). Sits in the top safe area so it never covers a
                  plant or the presenter HUD shell. */}
              <FlowerEventBubble
                event={currentEvent}
                onDismiss={dismissBubble}
              />
            </>
          )}
        </div>
      </GardenCanvasErrorBoundary>
    </GardenPixiContext.Provider>
  )
}

export default GardenBattleCanvasHost