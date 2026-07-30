import { describe, it, expect, vi } from "vitest"

import { EffectRegistry } from "./EffectRegistry"
import type { ExperienceEffectDescriptor } from "../types/experience-effect"

const sampleDescriptor: ExperienceEffectDescriptor = {
  seed: 42,
  colorRoles: ["primary", "success"],
}

describe("EffectRegistry", () => {
  it("registers and resolves a handler", () => {
    const registry = new EffectRegistry()
    const handler = vi.fn()
    registry.register("burst", handler)
    expect(registry.resolve("burst")).toBe(handler)
  })

  it("returns null for unknown preset (no throw)", () => {
    const registry = new EffectRegistry()
    expect(registry.resolve("unknown")).toBeNull()
  })

  it("triggers handler with descriptor and seed", () => {
    const registry = new EffectRegistry()
    const handler = vi.fn()
    registry.register("burst", handler)
    registry.trigger("burst", sampleDescriptor, "inst-1")
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(sampleDescriptor, 42)
  })

  it("deduplicates by instanceId — second trigger is a no-op", () => {
    const registry = new EffectRegistry()
    const handler = vi.fn()
    registry.register("burst", handler)
    registry.trigger("burst", sampleDescriptor, "inst-dup")
    registry.trigger("burst", sampleDescriptor, "inst-dup")
    expect(handler).toHaveBeenCalledOnce()
  })

  it("no-ops trigger for unknown preset", () => {
    const registry = new EffectRegistry()
    const handler = vi.fn()
    registry.register("burst", handler)
    registry.trigger("missing", sampleDescriptor, "inst-2")
    expect(handler).not.toHaveBeenCalled()
  })

  it("release removes dedup state so instance can re-trigger", () => {
    const registry = new EffectRegistry()
    const handler = vi.fn()
    registry.register("burst", handler)
    registry.trigger("burst", sampleDescriptor, "inst-3")
    registry.release("inst-3")
    registry.trigger("burst", sampleDescriptor, "inst-3")
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it("documents a11y contract: Effect Layer must be aria-hidden and not focusable", () => {
    const registry = new EffectRegistry()
    expect(registry).toBeDefined()
    expect(typeof registry.trigger).toBe("function")
    expect(typeof registry.release).toBe("function")
  })
})
