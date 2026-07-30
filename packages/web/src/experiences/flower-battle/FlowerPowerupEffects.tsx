/**
 * FlowerPowerupEffects — plant-anchored power-up animations + status lines.
 * Motion: motion/react useMotionValue (no per-frame re-renders).
 * Timings: flower-battle-motion.ts only. WP #938.2 / WP-FLB-13b.
 */

import { useEffect, useId } from "react"
import { useTranslation } from "react-i18next"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react"

import acidCloudSvg from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/acid-cloud.svg?raw"
import fertilizerSvg from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/fertilizer.svg?raw"
import sunbeamSvg from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/sunbeam.svg?raw"
import umbrellaSvg from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/umbrella.svg?raw"

import type { FlowerBattleActiveEffect } from "./FlowerBattlePlayerStatus"
import {
  AcidCloudTiming,
  getMotionTiming,
  UmbrellaTiming,
} from "./flower-battle-motion"
import { ANCHOR_POSITIONS, extractSvgInner } from "./flower-plant.constants"

const fertilizerInner = extractSvgInner(fertilizerSvg)
const umbrellaInner = extractSvgInner(umbrellaSvg)
const sunbeamInner = extractSvgInner(sunbeamSvg)
const acidCloudInner = extractSvgInner(acidCloudSvg)

const FERTILIZER_GRAIN_COUNT = 12
const SUNBEAM_RAY_COUNT = 5
const GRAIN_XY: ReadonlyArray<[number, number]> = [
  [-14, 8], [-8, 14], [-2, 10], [4, 16], [10, 12], [16, 18],
  [-16, 20], [-6, 22], [2, 24], [12, 22], [-10, 28], [6, 30],
]

const STATUS = [
  ["umbrella_shield", "flower-powerup-effects-status-umbrella-shield", "flowerPowerupEffects.effect.umbrellaShield", "☂ Schutz aktiv"],
  ["acid_rain", "flower-powerup-effects-status-acid-rain", "flowerPowerupEffects.effect.acidRain", "☁ Nächstes Wachstum −1"],
  ["sunbeam", "flower-powerup-effects-status-sunbeam", "flowerPowerupEffects.effect.sunbeam", "☀ Nächstes Wachstum +1"],
] as const

export interface FlowerPowerupEffectsProps {
  activeEffects: FlowerBattleActiveEffect[]
  /** Transient fertilizer replay key; not a persistent status. */
  fertilizerPlayKey?: number
  className?: string
}

function SvgIcon({ html }: { html: string }) {
  return <g transform="translate(-32 -32)" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Dünger: ≤12 grains; root opacity via useMotionValue. */
export function FertilizerEffect({ playKey, reduced }: { playKey: number; reduced: boolean }) {
  const timing = getMotionTiming(reduced, "fertilizer")
  const opacity = useMotionValue(0)
  useEffect(() => {
    if (playKey <= 0) { opacity.set(0); return }
    const exitMs =
      "phases" in timing && timing.phases && "Exit" in timing.phases
        ? Number(timing.phases.Exit)
        : timing.duration
    if (reduced) {
      opacity.set(1)
      const c = animate(opacity, 0, { duration: timing.duration / 1000, delay: timing.duration / 2000 })
      return () => c.stop()
    }
    opacity.set(0)
    const enter = animate(opacity, 1, { duration: 0.1 })
    const exit = animate(opacity, 0, {
      duration: Math.max(0.02, (timing.duration - exitMs) / 1000),
      delay: exitMs / 1000,
    })
    return () => { enter.stop(); exit.stop() }
  }, [playKey, reduced, timing, opacity])
  if (playKey <= 0) return null
  return (
    <motion.g data-testid="flower-powerup-fertilizer-effect" style={{ opacity }} className="text-ink">
      <SvgIcon html={fertilizerInner} />
      {!reduced && GRAIN_XY.slice(0, FERTILIZER_GRAIN_COUNT).map(([x, y], i) => (
        <circle key={i} data-testid="flower-powerup-fertilizer-grain" cx={x} cy={y} r={1.6} className="fill-current" opacity={0.85} />
      ))}
    </motion.g>
  )
}

/** Sonnenstrahl: 3–5 staggered rays (SunbeamTiming). */
export function SunbeamEffect({ reduced }: { reduced: boolean }) {
  const timing = getMotionTiming(reduced, "sunbeam")
  const r0 = useMotionValue(reduced ? 1 : 0)
  const r1 = useMotionValue(0)
  const r2 = useMotionValue(0)
  const r3 = useMotionValue(0)
  const r4 = useMotionValue(0)
  const rays = [r0, r1, r2, r3, r4]
  useEffect(() => {
    if (reduced) { r0.set(1); return }
    const ctrls = rays.map((mv, i) => {
      const start = "rayStartMs" in timing && typeof timing.rayStartMs === "function" ? timing.rayStartMs(i) : 0
      const dur = "rayDurationMs" in timing ? Number(timing.rayDurationMs) : 140
      mv.set(0)
      return animate(mv, [0, 1, 0], { duration: dur / 1000, delay: start / 1000, times: [0, 0.4, 1] })
    })
    return () => { for (const c of ctrls) c.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable motion values
  }, [reduced, timing])
  return (
    <motion.g data-testid="flower-powerup-sunbeam-effect" className="text-ink">
      <SvgIcon html={sunbeamInner} />
      {rays.map((mv, i) => (
        <motion.circle
          key={i}
          data-testid="flower-powerup-sunbeam-ray"
          cx={Math.cos((i / SUNBEAM_RAY_COUNT) * Math.PI * 2) * 18}
          cy={Math.sin((i / SUNBEAM_RAY_COUNT) * Math.PI * 2) * 18}
          r={2.2}
          className="fill-current"
          style={{ opacity: mv }}
        />
      ))}
    </motion.g>
  )
}

/** Schirm: scale 0.8→1.0 + UmbrellaTiming.dropletCount droplets. */
export function UmbrellaShieldEffect({ reduced }: { reduced: boolean }) {
  const timing = getMotionTiming(reduced, "umbrella")
  const scale = useMotionValue(reduced ? 1 : 0.8)
  const d0 = useMotionValue(0)
  const d1 = useMotionValue(0)
  const d2 = useMotionValue(0)
  const drops = [d0, d1, d2]
  const count = UmbrellaTiming.dropletCount
  useEffect(() => {
    if (reduced) { scale.set(1); for (const d of drops) d.set(0); return }
    scale.set(0.8)
    const scaleMs = "scaleDurationMs" in timing ? Number(timing.scaleDurationMs) : 200
    const dropStart = "dropletStartMs" in timing ? Number(timing.dropletStartMs) : 150
    const dropDur = "dropletDurationMs" in timing ? Number(timing.dropletDurationMs) : 150
    const sc = animate(scale, 1, { duration: scaleMs / 1000, ease: [0.34, 1.4, 0.64, 1] })
    const dcs = drops.map((mv, i) => {
      mv.set(0)
      return animate(mv, [0, 1, 0], { duration: dropDur / 1000, delay: dropStart / 1000 + i * 0.04, times: [0, 0.35, 1] })
    })
    return () => { sc.stop(); for (const c of dcs) c.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, timing, scale])
  const pos: Array<[number, number]> = [[-8, 10], [0, 14], [8, 10]]
  return (
    <motion.g data-testid="flower-powerup-umbrella-effect" style={{ scale }} className="text-ink">
      <SvgIcon html={umbrellaInner} />
      {!reduced && pos.slice(0, count).map(([x, y], i) => (
        <motion.circle key={i} data-testid="flower-powerup-umbrella-droplet" cx={x} cy={y} r={2} className="fill-current" style={{ opacity: drops[i] }} />
      ))}
    </motion.g>
  )
}

/** Saurer Regen: dropletCount drops + leaf tilt; no shrink/green. */
export function AcidRainEffect({ reduced }: { reduced: boolean }) {
  const timing = getMotionTiming(reduced, "acidCloud")
  const leafTilt = useMotionValue(0)
  const d0 = useMotionValue(0)
  const d1 = useMotionValue(0)
  const d2 = useMotionValue(0)
  const d3 = useMotionValue(0)
  const d4 = useMotionValue(0)
  const d5 = useMotionValue(0)
  const d6 = useMotionValue(0)
  const drops = [d0, d1, d2, d3, d4, d5, d6]
  const count = AcidCloudTiming.dropletCount
  useEffect(() => {
    if (reduced) { leafTilt.set(0); for (const d of drops) d.set(0); return }
    const tilt = animate(leafTilt, [-6, 0], { duration: timing.duration / 1000, ease: "easeOut" })
    const dcs = drops.slice(0, count).map((mv, i) => {
      const start = "dropletStartMs" in timing && typeof timing.dropletStartMs === "function"
        ? timing.dropletStartMs(i) : 120 + i * 40
      const fall = "dropletFallDurationMs" in timing ? Number(timing.dropletFallDurationMs) : 250
      mv.set(0)
      return animate(mv, [0, 1, 0], { duration: fall / 1000, delay: start / 1000, times: [0, 0.4, 1] })
    })
    return () => { tilt.stop(); for (const c of dcs) c.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, timing, leafTilt, count])
  const pos: Array<[number, number]> = [[-14, 8], [-8, 12], [-2, 8], [4, 12], [10, 8], [-10, 16], [8, 16]]
  return (
    <motion.g data-testid="flower-powerup-acid-rain-effect" style={{ rotate: leafTilt }} className="text-ink">
      <SvgIcon html={acidCloudInner} />
      {!reduced && pos.slice(0, count).map(([x, y], i) => (
        <motion.circle key={i} data-testid="flower-powerup-acid-droplet" cx={x} cy={y} r={1.8} className="fill-current" style={{ opacity: drops[i] }} />
      ))}
    </motion.g>
  )
}

function StatusLines({ activeEffects }: { activeEffects: FlowerBattleActiveEffect[] }) {
  const { t } = useTranslation("game")
  const rows = STATUS.filter(([id]) => activeEffects.includes(id))
  if (rows.length === 0) return null
  return (
    <div data-testid="flower-powerup-effects-status" className="flex flex-col gap-0.5 text-center">
      {rows.map(([id, testId, key, def]) => (
        <p key={id} data-testid={testId} className="text-xs text-ink-subtle">
          {t(key, { defaultValue: def })}
        </p>
      ))}
    </div>
  )
}

/** Docks at ANCHOR_POSITIONS.status. No sockets — props only. */
export function FlowerPowerupEffects({
  activeEffects,
  fertilizerPlayKey = 0,
  className = "",
}: FlowerPowerupEffectsProps) {
  const reduced = Boolean(useReducedMotion())
  const labelId = useId()
  const { t } = useTranslation("game")
  const playFertilizer = fertilizerPlayKey > 0
  if (activeEffects.length === 0 && !playFertilizer) return null

  const aria = STATUS.filter(([id]) => activeEffects.includes(id)).map(([, , key, def]) =>
    t(key, { defaultValue: def }),
  )
  if (playFertilizer) {
    aria.push(t("flowerPowerupEffects.effect.fertilizer", { defaultValue: "🌱 Dünger" }))
  }
  const { x: ax, y: ay } = ANCHOR_POSITIONS.status

  return (
    <div
      data-testid="flower-powerup-effects"
      data-anchor="status-anchor"
      data-reduced-motion={reduced ? "true" : "false"}
      className={`pointer-events-none absolute inset-0 ${className}`.trim()}
      role="img"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="sr-only">{aria.join(". ")}</span>
      <div className="absolute left-1/2 z-10 w-max max-w-full -translate-x-1/2" style={{ top: `${(ay / 300) * 100}%` }}>
        <StatusLines activeEffects={activeEffects} />
      </div>
      <svg viewBox="0 0 200 300" className="absolute inset-0 h-full w-full text-ink" aria-hidden="true" focusable="false">
        <g data-anchor="status-anchor" transform={`translate(${ax} ${ay})`}>
          {playFertilizer ? <FertilizerEffect playKey={fertilizerPlayKey} reduced={reduced} /> : null}
          {activeEffects.includes("sunbeam") ? <SunbeamEffect reduced={reduced} /> : null}
          {activeEffects.includes("umbrella_shield") ? <UmbrellaShieldEffect reduced={reduced} /> : null}
          {activeEffects.includes("acid_rain") ? <AcidRainEffect reduced={reduced} /> : null}
        </g>
      </svg>
    </div>
  )
}

export default FlowerPowerupEffects
