import type {
  ExperienceEffectDescriptor,
  ExperienceEffectPresetId,
} from "../types/experience-effect"

export type ExperienceEffectHandler = (
  descriptor: ExperienceEffectDescriptor,
) => (() => void) | undefined

/**
 * Registry for experience-layer visual effect presets.
 *
 * Effect implementations rendered on the `effects` stage layer must be
 * `aria-hidden` and not focusable (`tabIndex={-1}` / no interactive children)
 * so HUD and overlay layers retain keyboard and screen-reader access.
 */
export class EffectRegistry {
  private readonly handlers = new Map<ExperienceEffectPresetId, ExperienceEffectHandler>()
  private readonly activeInstances = new Set<string>()
  private readonly cleanups = new Map<string, () => void>()

  register(presetId: ExperienceEffectPresetId, handler: ExperienceEffectHandler): void {
    this.handlers.set(presetId, handler)
  }

  resolve(presetId: ExperienceEffectPresetId): ExperienceEffectHandler | null {
    return this.handlers.get(presetId) ?? null
  }

  /**
   * Invokes the handler for `presetId` when `instanceId` is not already active.
   * Unknown presets are a no-op (no throw). Returns whether a handler ran.
   */
  trigger(
    presetId: ExperienceEffectPresetId,
    descriptor: ExperienceEffectDescriptor,
    instanceId: string,
  ): boolean {
    if (this.activeInstances.has(instanceId)) {
      return false
    }

    const handler = this.resolve(presetId)
    if (!handler) {
      return false
    }

    this.activeInstances.add(instanceId)

    const cleanup = handler(descriptor)
    if (typeof cleanup === "function") {
      this.cleanups.set(instanceId, cleanup)
    }

    return true
  }

  /** Releases an active instance and runs any handler cleanup callback. */
  release(instanceId: string): void {
    this.activeInstances.delete(instanceId)

    const cleanup = this.cleanups.get(instanceId)
    if (cleanup) {
      cleanup()
      this.cleanups.delete(instanceId)
    }
  }
}

/** Shared singleton registry for production wiring. */
export const effectRegistry = new EffectRegistry()
