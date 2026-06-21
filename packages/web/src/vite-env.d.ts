/// <reference types="vite/client" />

declare const __APP_VERSION__: string

// canvas-confetti ships without bundled types; provide a minimal declaration.
declare module "canvas-confetti" {
  interface Options {
    particleCount?: number
    angle?: number
    spread?: number
    startVelocity?: number
    decay?: number
    gravity?: number
    drift?: number
    ticks?: number
    origin?: { x?: number; y?: number }
    colors?: string[]
    shapes?: string[]
    scalar?: number
    zIndex?: number
    disableForReducedMotion?: boolean
  }

  function confetti(options?: Options): Promise<null> | null
  namespace confetti {
    function reset(): void
    function create(
      canvas: HTMLCanvasElement,
      options?: { resize?: boolean; useWorker?: boolean },
    ): (options?: Options) => Promise<null>
  }

  export = confetti
}

// Host-integration contract globals — see HOST_INTEGRATION.md
interface Window {
  /** Canonical versioned host-integration contract. */
  __RAZZ_HOST?: { version: number; joinBase?: string }
  /** Legacy join-base override (superseded by __RAZZ_HOST.joinBase). */
  __RAZZ_JOIN_BASE?: string
}
