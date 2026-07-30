import { useEffect, useRef } from "react"

import {
  getThemeTokenCssVar,
  type CssTokenName,
} from "@razzoozle/common/theme-tokens"

import {
  resolveEffectAnchorToPixels,
  type AnchorPixelCoordinates,
} from "./effect-anchor"
import { EffectRegistry } from "./EffectRegistry"
import {
  DEFAULT_PARTICLE_CAPACITY,
  ParticleEngine,
  REDUCED_MOTION_PARTICLE_CAPACITY,
} from "./ParticleEngine"
import type {
  ExperienceEffectColorRole,
  ExperienceEffectDescriptor,
} from "../types/experience-effect"

/**
 * Minimal engine contract the wrapper depends on (update/render/clear). The
 * real {@link ParticleEngine} satisfies this structurally — extra members
 * like `emit`/`capacity` are for the preset-specific `ParticleEmitter`
 * implementations that receive the full engine via `ParticleEmitContext`.
 */
export interface ParticleCanvasEngine {
  update(deltaMs: number): void
  render(): void
  clear(): void
}

/** Payload handed to a preset's emitter when its effect is triggered. */
export interface ParticleEmitContext {
  engine: ParticleCanvasEngine
  descriptor: ExperienceEffectDescriptor
  seed: number | string
  instanceId: string
  origin: AnchorPixelCoordinates
  colors: string[]
}

/** Preset-specific particle spawner. Concrete presets land in WP-KIT-11. */
export interface ParticleEmitter {
  emit(context: ParticleEmitContext): void
}

interface ParticleCanvasResizeObserver {
  observe(target: Element): void
  unobserve(target: Element): void
  disconnect(): void
}

interface ParticleCanvasDocument {
  readonly visibilityState: DocumentVisibilityState
  addEventListener(
    type: "visibilitychange",
    listener: EventListenerOrEventListenerObject,
  ): void
  removeEventListener(
    type: "visibilitychange",
    listener: EventListenerOrEventListenerObject,
  ): void
}

/**
 * Injectable browser surface. Production uses `createDefaultEnvironment()`;
 * tests supply structural fakes — no jsdom required.
 */
export interface ParticleCanvasEnvironment {
  devicePixelRatio: number
  matchMedia: (query: string) => { matches: boolean }
  requestAnimationFrame: (callback: FrameRequestCallback) => number
  cancelAnimationFrame: (id: number) => void
  ResizeObserver: new (
    callback: ResizeObserverCallback,
  ) => ParticleCanvasResizeObserver
  document: ParticleCanvasDocument
}

export interface AttachParticleCanvasOptions {
  registry: EffectRegistry
  emittersByPresetId: Record<string, ParticleEmitter>
  /** Defaults to `(context, capacity) => new ParticleEngine(context, capacity)`. */
  createEngine?: (
    context: CanvasRenderingContext2D,
    capacity: number,
  ) => ParticleCanvasEngine
}

/**
 * Maps semantic effect color roles to design tokens (SDD §16 — descriptors
 * reference roles only, never hex). `primary`→`--color-primary` and
 * `success`→`--state-correct` are pinned by contract; the remaining roles
 * follow the same state-token pairing (`correct`/`wrong` mirror
 * `success`/`error`) using existing tokens only — no new tokens introduced.
 */
const COLOR_ROLE_TOKENS: Record<ExperienceEffectColorRole, CssTokenName> = {
  primary: "--color-primary",
  secondary: "--color-secondary",
  accent: "--color-accent",
  success: "--state-correct",
  warning: "--timer-urgent",
  error: "--state-wrong",
  neutral: "--ink-muted",
  correct: "--state-correct",
  wrong: "--state-wrong",
  info: "--color-secondary",
  muted: "--surface-muted",
}

const STAGE_CENTER_ANCHOR = { type: "normalized", x: 0.5, y: 0.5 } as const

function resolveColors(
  roles: ExperienceEffectColorRole[] | undefined,
): string[] {
  return (roles ?? []).map((role) =>
    getThemeTokenCssVar(COLOR_ROLE_TOKENS[role]),
  )
}

function createDefaultEnvironment(): ParticleCanvasEnvironment {
  return {
    devicePixelRatio: window.devicePixelRatio,
    matchMedia: (query) => window.matchMedia(query),
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    ResizeObserver: window.ResizeObserver,
    document,
  }
}

/**
 * Attaches the particle-rendering lifecycle to a `<canvas>` element:
 * DPR-aware sizing (clamped to 2x), a visibility-gated rAF loop, resize
 * handling via ResizeObserver, and EffectRegistry handler registration for
 * every supplied preset. Pure imperative core behind `ParticleCanvas` —
 * exported standalone so it is testable without React or jsdom.
 *
 * @returns An idempotent cleanup function: cancels the loop, disconnects the
 *   resize observer, removes the visibility listener, unregisters every
 *   preset handler (only if still current — see EffectRegistry.register),
 *   and clears the engine's particle pool. Frames that race in after
 *   disposal are ignored (checked at the top of every tick).
 */
export function attachParticleCanvas(
  canvas: HTMLCanvasElement,
  options: AttachParticleCanvasOptions,
  environment: ParticleCanvasEnvironment = createDefaultEnvironment(),
): () => void {
  const maybeContext = canvas.getContext("2d")
  if (!maybeContext) {
    return () => {}
  }
  // Re-bound as a definitely-non-null const: closures below (resize/tick)
  // don't retain the narrowing tsc already proved above.
  const context: CanvasRenderingContext2D = maybeContext

  function resize(): void {
    const dpr = Math.min(environment.devicePixelRatio || 1, 2)
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()

  const resizeObserver = new environment.ResizeObserver(() => resize())
  resizeObserver.observe(canvas)

  const reducedMotion = environment.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches
  const capacity = reducedMotion
    ? REDUCED_MOTION_PARTICLE_CAPACITY
    : DEFAULT_PARTICLE_CAPACITY
  const createEngine =
    options.createEngine ??
    ((ctx: CanvasRenderingContext2D, cap: number) => new ParticleEngine(ctx, cap))
  const engine = createEngine(context, capacity)

  let disposed = false
  let frameId: number | null = null
  let lastTimestamp: number | null = null

  function tick(timestamp: number): void {
    if (disposed || environment.document.visibilityState === "hidden") {
      return
    }

    const deltaMs = lastTimestamp === null ? 0 : timestamp - lastTimestamp
    lastTimestamp = timestamp

    context.clearRect(0, 0, canvas.width, canvas.height)
    engine.update(deltaMs)
    engine.render()

    frameId = environment.requestAnimationFrame(tick)
  }

  function startLoop(): void {
    if (disposed || frameId !== null) {
      return
    }
    frameId = environment.requestAnimationFrame(tick)
  }

  function stopLoop(): void {
    if (frameId !== null) {
      environment.cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  function onVisibilityChange(): void {
    if (environment.document.visibilityState === "hidden") {
      stopLoop()
    } else {
      startLoop()
    }
  }

  environment.document.addEventListener("visibilitychange", onVisibilityChange)
  startLoop()

  const unregisterHandlers = Object.entries(options.emittersByPresetId).map(
    ([presetId, emitter]) =>
      options.registry.register(presetId, (descriptor, seed, instanceId) => {
        const origin = resolveEffectAnchorToPixels(
          descriptor.anchor ?? STAGE_CENTER_ANCHOR,
          { width: canvas.clientWidth, height: canvas.clientHeight },
        )
        emitter.emit({
          engine,
          descriptor,
          seed,
          instanceId,
          origin,
          colors: resolveColors(descriptor.colorRoles),
        })
      }),
  )

  return function cleanup(): void {
    if (disposed) {
      return
    }
    disposed = true
    stopLoop()
    resizeObserver.disconnect()
    environment.document.removeEventListener(
      "visibilitychange",
      onVisibilityChange,
    )
    for (const unregister of unregisterHandlers) {
      unregister()
    }
    engine.clear()
  }
}

export interface ParticleCanvasProps {
  registry: EffectRegistry
  emittersByPresetId: Record<string, ParticleEmitter>
  className?: string
}

/**
 * ParticleCanvas — Experience-Kit particle effects canvas (WP-KIT-06).
 *
 * Renders exactly one inert `<canvas>` and wires the imperative particle
 * lifecycle (see `attachParticleCanvas`) on mount, tearing it down on
 * unmount. Purely declarative from React's side — no per-frame state, no
 * re-renders; all animation runs inside the imperative rAF loop. Sizing/
 * stacking (position, inset, z-index) is the composing parent's decision
 * (see `ExperienceLayer`), matching that component's className-driven
 * convention — this component only fills its own box.
 */
export const ParticleCanvas = ({
  registry,
  emittersByPresetId,
  className = "",
}: ParticleCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    return attachParticleCanvas(canvas, { registry, emittersByPresetId })
  }, [registry, emittersByPresetId])

  return (
    <canvas
      ref={canvasRef}
      aria-label="effects layer"
      aria-hidden="true"
      tabIndex={-1}
      className={`h-full w-full ${className}`.trim()}
      style={{ pointerEvents: "none" }}
    />
  )
}
