import { describe, expect, it, vi } from "vitest"

import { EffectRegistry } from "./EffectRegistry"
import {
  ExperienceEffectPresetId,
  type ExperienceEffectDescriptor,
} from "../types/experience-effect"

const descriptor: ExperienceEffectDescriptor = {
  seed: 42,
  colorRoles: ["--color-primary", "--color-accent"],
}

describe("EffectRegistry", () => {
  it("registers and resolves a handler", () => {
    const registry = new EffectRegistry()
    const handler = vi.fn()

    registry.register(ExperienceEffectPresetId.ConfettiBurst, handler)

    expect(registry.resolve(ExperienceEffectPresetId.ConfettiBurst)).toBe(handler)
  })

  it("resolve returns null for unknown preset without throwing", () => {
    const registry = new EffectRegistry()

    expect(registry.resolve("unknown-preset" as ExperienceEffectPresetId)).toBeNull()
  })

  it("trigger is a no-op for unknown preset", () => {
    const registry = new EffectRegistry()

    expect(
      registry.trigger("unknown-preset" as ExperienceEffectPresetId, descriptor, "inst-1"),
    ).toBe(false)
  })

  it("trigger invokes handler and deduplicates by instanceId", () => {
    const registry = new EffectRegistry()
    const handler = vi.fn()

    registry.register(ExperienceEffectPresetId.ConfettiBurst, handler)

    expect(registry.trigger(ExperienceEffectPresetId.ConfettiBurst, descriptor, "inst-1")).toBe(
      true,
    )
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(descriptor)

    expect(registry.trigger(ExperienceEffectPresetId.ConfettiBurst, descriptor, "inst-1")).toBe(
      false,
    )
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("release runs cleanup and allows re-trigger", () => {
    const registry = new EffectRegistry()
    const cleanup = vi.fn()
    const handler = vi.fn(() => cleanup)

    registry.register(ExperienceEffectPresetId.ScreenFlash, handler)

    expect(registry.trigger(ExperienceEffectPresetId.ScreenFlash, descriptor, "inst-2")).toBe(true)

    registry.release("inst-2")
    expect(cleanup).toHaveBeenCalledTimes(1)

    expect(registry.trigger(ExperienceEffectPresetId.ScreenFlash, descriptor, "inst-2")).toBe(true)
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
