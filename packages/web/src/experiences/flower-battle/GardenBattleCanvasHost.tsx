/**
 * GardenBattleCanvasHost — PixiJS Application lifecycle shell for the Flower
 * Battle presenter scene (WP-02 / ADR-013).
 *
 * Owns mount/resize/visibility/destroy. Does NOT own scene content (WP-05),
 * asset loading (WP-03), or the default display path (feature gate later).
 */

import {
  Component,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react"
import type { Application } from "pixi.js"

import { CURRENT_GARDEN_RECIPE_VERSION } from "./background"
import {
  attachGardenPixiApplication,
  type AttachGardenPixiOptions,
  type GardenPixiEnvironment,
} from "./attachGardenPixiApplication"
import { FlowerGardenScene } from "./FlowerGardenScene"
import type {
  GardenBattleCanvasHostProps,
  GardenPixiHookValue,
  GardenRenderQuality,
  GardenScene,
} from "./garden-pixi.types"

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
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
      className="relative h-full w-full overflow-hidden bg-surface"
      role="region"
      aria-label="Flower Battle garden scene (static)"
    >
      <div id="garden-status" aria-live="polite" aria-atomic="true" className="sr-only">
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

export interface GardenBattleCanvasHostInternalProps
  extends GardenBattleCanvasHostProps {
  /** Test-only: inject attach options (Application/scene factories). */
  attachOptions?: AttachGardenPixiOptions
  /** Test-only: inject browser environment for attach. */
  environment?: GardenPixiEnvironment
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

  const prefersReducedMotion = useMemo(() => readPrefersReducedMotion(), [])
  const effectiveQuality = resolveGardenRenderQuality(
    quality,
    prefersReducedMotion,
  )
  const useStatic = effectiveQuality === "static" || error !== null

  // Stable callback refs so effect deps stay narrow.
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError

  useEffect(() => {
    if (effectiveQuality === "static") {
      disposeRef.current?.()
      disposeRef.current = undefined
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
        const result = await attachGardenPixiApplication(
          canvas,
          {
            ...attachOptions,
            onReady: (handle, nextScene) => {
              attachOptions?.onReady?.(handle, nextScene)
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
          environment,
        )

        if (cancelled) {
          result.dispose()
          return
        }
        disposeRef.current = result.dispose
      } catch (caught) {
        if (cancelled) return
        disposeRef.current?.()
        disposeRef.current = undefined
        setApp(null)
        setScene(null)
        setIsReady(false)
        const nextError =
          caught instanceof Error
            ? caught
            : new Error(String(caught ?? "PixiJS init failed"))
        setError(nextError)
        onErrorRef.current?.(nextError)
      }
    })()

    return () => {
      cancelled = true
      disposeRef.current?.()
      disposeRef.current = undefined
      // Avoid setState-after-unmount; next mount starts from idle defaults.
    }
  }, [effectiveQuality, attachOptions, environment])

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
          disposeRef.current?.()
          disposeRef.current = undefined
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
          className={`relative h-full w-full min-h-0 overflow-hidden ${className}`.trim()}
        >
          {useStatic ? (
            staticNode
          ) : (
            <>
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
                {isReady
                  ? "Garden scene ready"
                  : "Garden scene loading"}
              </div>
            </>
          )}
        </div>
      </GardenCanvasErrorBoundary>
    </GardenPixiContext.Provider>
  )
}

export default GardenBattleCanvasHost
