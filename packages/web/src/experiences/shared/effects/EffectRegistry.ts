import type { ExperienceEffectDescriptor } from "../types/experience-effect"

/**
 * Handler invoked when an effect preset is triggered.
 *
 * @param descriptor - Declarative effect payload (anchor, colorRoles, seed).
 * @param seed - Deterministic seed extracted from the descriptor for PRNG init.
 * @param instanceId - Trigger instance id (dedup key), forwarded so a handler
 *   can key its own per-instance work (e.g. an Effect Layer resolving origin
 *   coordinates per trigger).
 */
export type EffectHandler = (
  descriptor: ExperienceEffectDescriptor,
  seed: number | string,
  instanceId: string,
) => void

/** Disposer returned by {@link EffectRegistry.register}. Idempotent. */
export type EffectUnregister = () => void

/**
 * Pure data/handler mapping layer for declarative experience effects (SDD §16).
 *
 * @remarks
 * **Not a renderer** — this registry maps preset IDs to handlers and tracks
 * trigger deduplication. Canvas/DOM rendering lives in the Effect Layer
 * (WP-KIT-10).
 *
 * **Accessibility contract** — the Effect Layer that consumes this registry
 * must render with aria-hidden="true" and must not be focusable
 * (tabIndex={-1} or equivalent). The registry documents this contract;
 * enforcement is the consumer's responsibility.
 *
 * **No lifecycle timers** — the registry does not schedule cleanup. Consumers
 * call EffectRegistry.release when an effect instance is done.
 */
export class EffectRegistry {
  private readonly handlers = new Map<string, EffectHandler>()
  private readonly triggeredInstances = new Map<string, boolean>()

  /**
   * Registers a handler for a preset id and returns a disposer.
   *
   * The disposer only unregisters the handler it captured — if a later
   * `register` call replaced it for the same presetId, calling a stale
   * disposer is a safe no-op (guards against unmount races where an old
   * effect's cleanup runs after a new instance already re-registered).
   */
  register(presetId: string, handler: EffectHandler): EffectUnregister {
    this.handlers.set(presetId, handler)
    return () => {
      if (this.handlers.get(presetId) === handler) {
        this.handlers.delete(presetId)
      }
    }
  }

  resolve(presetId: string): EffectHandler | null {
    return this.handlers.get(presetId) ?? null
  }

  trigger(
    presetId: string,
    descriptor: ExperienceEffectDescriptor,
    instanceId: string,
  ): void {
    if (this.triggeredInstances.has(instanceId)) {
      return
    }

    const handler = this.resolve(presetId)
    if (!handler) {
      return
    }

    this.triggeredInstances.set(instanceId, true)
    handler(descriptor, descriptor.seed, instanceId)
  }

  release(instanceId: string): void {
    this.triggeredInstances.delete(instanceId)
  }
}

/** Shared singleton registry for app-wide effect preset resolution. */
export const effectRegistry = new EffectRegistry()
