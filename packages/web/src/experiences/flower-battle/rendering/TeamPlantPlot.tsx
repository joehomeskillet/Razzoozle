/**
 * TeamPlantPlot — React wrapper that positions team-flower PixiJS instances
 * inside the dynamic 2/3/4-slot layout produced by `getTeamSlotLayout`
 * (WP-PRESENTER-4, SDD §20.6).
 *
 * Pure presentation: this component owns the Pixi mount, computes the
 * `getTeamSlotLayout` for the team count, and renders one `createTeamFlower`
 * per slot. It does NOT own the underlying `Application`; the caller passes
 * a pre-built `Application` (or any host that exposes a `stage` Container).
 * Re-uses the same instance across props via `updateTeamFlower`, so growth
 * transitions and face swaps never re-instantiate the underlying Containers.
 *
 * Hosts GardenBattleCanvasHost (W8-5) wires this component into the live
 * flower-teams layer; tests instantiate it directly with a fake host.
 */

import { Container } from "pixi.js"
import { useEffect, useMemo, useRef } from "react"

import { getTeamSlotLayout } from "../garden-team-slot-layout"
import {
  createTeamFlower,
  updateTeamFlower,
  type ActivePlantEffect,
  type CreateTeamFlowerOptions,
  type GrowthStage,
  type PlantFace,
  type TeamFlowerInstance,
  type TeamFlowerViewport,
  type TeamId,
} from "./teamFlowerFactory"

export interface TeamPlantSlotSpec {
  teamId: TeamId
  stage: GrowthStage
  face?: PlantFace
  effects?: readonly ActivePlantEffect[]
  sunPoints?: number
  /** Stable React key + Pixi label. */
  label?: string
}

export interface TeamPlantPlotProps {
  /** Logical viewport dimensions in CSS pixels. */
  viewport: TeamFlowerViewport
  /** Slot description; order is stable across re-renders. */
  slots: readonly TeamPlantSlotSpec[]
  /** Host container — must expose `addChild` (real or fake stage). */
  host: { stage: Container }
}

/**
 * Returned array mirrors `slots` 1:1 by index; useful for e2e probes and
 * the W8-5 HUD layer wanting to overlay per-team meters.
 */
export interface TeamPlantPlotHandle {
  instances: readonly TeamFlowerInstance[]
  root: Container
  destroy(): void
}

interface UseTeamPlantPlotResult {
  root: Container
  instances: TeamFlowerInstance[]
}

/**
 * Pure hook — mounted by `TeamPlantPlot`. Factored out so e2e probes can
 * reuse it without a React tree.
 */
export function useTeamPlantPlot(
  host: TeamPlantPlotProps["host"],
  viewport: TeamFlowerViewport,
  slots: readonly TeamPlantSlotSpec[],
): UseTeamPlantPlotResult {
  const rootRef = useRef<Container | null>(null)
  const instancesRef = useRef<Map<number, TeamFlowerInstance>>(new Map())

  const layout = useMemo(
    () => getTeamSlotLayout(slots.length, viewport),
    [slots.length, viewport.width, viewport.height],
  )

  // Create the root container once.
  useEffect(() => {
    const root = new Container()
    root.label = "team-plant-plot-root"
    host.stage.addChild(root)
    rootRef.current = root
    return () => {
      host.stage.removeChild(root)
      root.destroy({ children: true })
      instancesRef.current.clear()
      rootRef.current = null
    }
  }, [host])

  // Mount / update instances in stable order.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const next = new Map<number, TeamFlowerInstance>()
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!
      const slotLayout = layout[i]
      if (!slotLayout) continue
      const opts: CreateTeamFlowerOptions = {
        teamId: slot.teamId,
        stage: slot.stage,
        ...(slot.face !== undefined ? { face: slot.face } : {}),
        ...(slot.effects !== undefined ? { effects: slot.effects } : {}),
        viewport,
        ...(slot.label !== undefined ? { label: slot.label } : {}),
      }
      let instance = instancesRef.current.get(i)
      if (!instance) {
        instance = createTeamFlower(opts)
        root.addChild(instance.container)
      } else {
        updateTeamFlower(instance, opts)
      }
      // Position the plant at the slot center, bottom-aligned so the soil
      // shadow sits a touch above the lower slot edge.
      const cx = (slotLayout.xPercent + slotLayout.widthPercent / 2) / 100
      const cy =
        (slotLayout.yPercent + slotLayout.heightPercent * 0.85) / 100
      instance.container.position.set(
        cx * viewport.width,
        cy * viewport.height,
      )
      next.set(i, instance)
    }
    // Remove stale instances (team count shrink).
    for (const [idx, instance] of instancesRef.current) {
      if (!next.has(idx)) {
        root.removeChild(instance.container)
        instance.destroy()
      }
    }
    instancesRef.current = next
  }, [slots, layout, viewport])

  return {
    root: rootRef.current ?? new Container({ isRenderGroup: false }),
    instances: Array.from(instancesRef.current.values()),
  }
}

/**
 * Presentational React component. Use {@link useTeamPlantPlot} when a test
 * or non-React host needs the same machinery without the JSX wrapper.
 */
export function TeamPlantPlot({
  viewport,
  slots,
  host,
}: TeamPlantPlotProps): null {
  useTeamPlantPlot(host, viewport, slots)
  return null
}

export default TeamPlantPlot
