/**
 * Garden particle + grass-wind controller.
 *
 * Owns three pools:
 *   - Motes: persistent drifters inside `ambient`. Wind adds a per-frame
 *     dx/dy on top of the base velocity. Lifetime 5–10 s, recycled.
 *   - Gust leaves: short-lived bursts during a positive gust window
 *     (wind sample ≥ activation threshold). Quality ≥ medium only.
 *   - Grass tufts: sweeps `layer-grass` looking for `grass-detail-*`
 *     sprites and applies a wind-driven rotation around the bottom anchor.
 *
 * Quality tiering: high (10–12 motes / 1–3 gust leaves / all tufts),
 * medium (6–8 / 1–2 / fewer tufts), low (3–4 / 0 / near-camera tufts),
 * static / reduced-motion → empty pools.
 */

import { Container, Sprite, Texture } from "pixi.js"

import {
  GUST_LEAF_ACTIVATION_THRESHOLD,
  GUST_LEAF_COUNTS,
  GUST_LEAF_MID_COUNT,
  GRASS_TUFT_COUNTS,
  GRASS_WIND_SWEEP_RANGE,
  MOTE_BASE_SPEED_RANGE,
  MOTE_COUNTS,
  MOTE_LIFETIME_RANGE,
  MOTE_MID_COUNT,
  MOTE_SCALE_RANGE,
  MOTE_ALPHA_RANGE,
  MOTE_Y_BAND,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"
import type { GardenRenderQuality } from "../../garden-pixi.types"
import { ATMOSPHERE_HEIGHT } from "./garden-atmosphere.constants"

export interface GardenParticleControllerOptions {
  seed?: number
  quality: GardenRenderQuality
  reducedMotion?: boolean
  ambient: Container
  grass: Container
  moteTexture?: Texture | null
  windLeafTextures?: readonly Texture[]
}

interface MoteSlot {
  sprite: Sprite
  baseSpeedX: number
  baseSpeedY: number
  lifetimeSec: number
  ageSec: number
  active: boolean
}

interface GustLeafSlot {
  sprite: Sprite
  rotationSpeed: number
  vy: number
  vx: number
  ageSec: number
  lifetimeSec: number
  active: boolean
}

export class GardenParticleController {
  private readonly rng: SeededRandom
  private readonly quality: GardenRenderQuality
  private readonly reducedMotion: boolean
  private readonly ambient: Container
  private readonly grass: Container
  private readonly moteTexture: Texture | null
  private readonly windLeafTextures: readonly Texture[]
  private readonly motes: MoteSlot[] = []
  private readonly gustLeaves: GustLeafSlot[] = []
  /** Precomputed rotation phases for the grass tuft sweep. */
  private readonly grassTufts: Sprite[] = []
  private readonly grassPhases: number[] = []
  private readonly grassBaseRotations: number[] = []
  private elapsedMs = 0
  private destroyed = false

  constructor(options: GardenParticleControllerOptions) {
    this.quality = options.quality
    this.reducedMotion = options.reducedMotion ?? false
    this.ambient = options.ambient
    this.grass = options.grass
    this.moteTexture = options.moteTexture ?? null
    this.windLeafTextures = options.windLeafTextures ?? []
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)

    this.initMotes()
    this.initGustLeaves()
    this.initGrass()
  }

  /** Mote pool size (= configured maximum motes, matches quality). */
  getMoteCount(): number {
    return this.motes.length
  }

  /** Number of gust leaves currently in flight. */
  getGustLeafCount(): number {
    let n = 0
    for (const slot of this.gustLeaves) {
      if (slot.active) n += 1
    }
    return n
  }

  /** Total gust-leaf pool capacity. */
  getGustLeafCapacity(): number {
    return this.gustLeaves.length
  }

  update(deltaMs: number, windSample: number): void {
    if (this.destroyed || this.reducedMotion) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    this.elapsedMs += clamped
    const dt = clamped / 1000

    this.updateMotes(dt, windSample)
    this.updateGustLeaves(dt, windSample)
    this.updateGrass(windSample)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const slot of this.motes) {
      if (slot.sprite.parent) {
        slot.sprite.parent.removeChild(slot.sprite)
      }
      slot.sprite.destroy()
    }
    this.motes.length = 0
    for (const slot of this.gustLeaves) {
      if (slot.sprite.parent) {
        slot.sprite.parent.removeChild(slot.sprite)
      }
      slot.sprite.destroy()
    }
    this.gustLeaves.length = 0
    this.grassTufts.length = 0
    this.grassPhases.length = 0
    this.grassBaseRotations.length = 0
  }

  private initMotes(): void {
    const count = MOTE_MID_COUNT[this.quality]
    if (count === 0 || !this.moteTexture) return
    for (let i = 0; i < count; i += 1) {
      const sprite = new Sprite(this.moteTexture)
      sprite.label = `atmosphere-mote-${i}`
      sprite.anchor.set(0.5, 0.5)
      sprite.alpha = this.rng.range(
        MOTE_ALPHA_RANGE[0],
        MOTE_ALPHA_RANGE[1],
      )
      const scale = this.rng.range(
        MOTE_SCALE_RANGE[0],
        MOTE_SCALE_RANGE[1],
      )
      sprite.scale.set(scale)
      sprite.visible = false
      this.ambient.addChild(sprite)
      const lifetime = this.rng.range(
        MOTE_LIFETIME_RANGE[0],
        MOTE_LIFETIME_RANGE[1],
      )
      this.motes.push({
        sprite,
        baseSpeedX: 0,
        baseSpeedY: 0,
        lifetimeSec: lifetime,
        ageSec: lifetime, // start expired → first update respawns
        active: false,
      })
    }
  }

  private updateMotes(dt: number, windSample: number): void {
    const yMin = ATMOSPHERE_HEIGHT * MOTE_Y_BAND[0]
    const yMax = ATMOSPHERE_HEIGHT * MOTE_Y_BAND[1]
    for (const slot of this.motes) {
      slot.ageSec += dt
      if (!slot.active || slot.ageSec >= slot.lifetimeSec) {
        // Recycle.
        slot.ageSec = 0
        slot.lifetimeSec = this.rng.range(
          MOTE_LIFETIME_RANGE[0],
          MOTE_LIFETIME_RANGE[1],
        )
        slot.baseSpeedX = this.rng.range(
          MOTE_BASE_SPEED_RANGE[0],
          MOTE_BASE_SPEED_RANGE[1],
        )
        slot.baseSpeedY = this.rng.range(
          -MOTE_BASE_SPEED_RANGE[0],
          MOTE_BASE_SPEED_RANGE[0] * 0.5,
        )
        slot.sprite.position.set(
          this.rng.range(40, 1880),
          this.rng.range(yMin, yMax),
        )
        slot.sprite.visible = true
        slot.active = true
      }
      const dx = (slot.baseSpeedX + windSample * 14) * dt
      const dy = slot.baseSpeedY * dt
      slot.sprite.x += dx
      slot.sprite.y += dy
      // Wrap horizontally so motes never crawl off the canvas.
      if (slot.sprite.x > 1940) slot.sprite.x = -20
      if (slot.sprite.x < -40) slot.sprite.x = 1940
    }
  }

  private initGustLeaves(): void {
    const count = GUST_LEAF_MID_COUNT[this.quality]
    if (count === 0) return
    if (this.quality === "low" || this.quality === "static") return
    if (this.windLeafTextures.length === 0) return
    for (let i = 0; i < count; i += 1) {
      const tex = this.windLeafTextures[i % this.windLeafTextures.length]!
      const sprite = new Sprite(tex)
      sprite.label = `gust-leaf-${i}`
      sprite.anchor.set(0.5, 0.5)
      sprite.visible = false
      this.ambient.addChild(sprite)
      this.gustLeaves.push({
        sprite,
        rotationSpeed: 0,
        vy: 0,
        vx: 0,
        ageSec: 0,
        lifetimeSec: 0,
        active: false,
      })
    }
  }

  private updateGustLeaves(dt: number, windSample: number): void {
    if (this.gustLeaves.length === 0) return
    const activeGust = windSample >= GUST_LEAF_ACTIVATION_THRESHOLD
    for (const slot of this.gustLeaves) {
      if (slot.active) {
        slot.ageSec += dt
        slot.sprite.x += slot.vx * dt + windSample * 18 * dt
        slot.sprite.y += slot.vy * dt
        slot.sprite.rotation += slot.rotationSpeed * dt
        if (
          slot.ageSec >= slot.lifetimeSec ||
          slot.sprite.y > ATMOSPHERE_HEIGHT + 40
        ) {
          slot.active = false
          slot.sprite.visible = false
        }
      } else if (activeGust) {
        // Spawn a fresh leaf, biased toward the upper-mid canvas.
        slot.vx = this.rng.range(-22, 22)
        slot.vy = this.rng.range(14, 32)
        slot.rotationSpeed = this.rng.range(-2.4, 2.4)
        slot.lifetimeSec = this.rng.range(2.5, 4.5)
        slot.ageSec = 0
        slot.sprite.position.set(
          this.rng.range(120, 1820),
          this.rng.range(
            ATMOSPHERE_HEIGHT * 0.18,
            ATMOSPHERE_HEIGHT * 0.55,
          ),
        )
        slot.sprite.rotation = this.rng.range(0, Math.PI * 2)
        slot.sprite.visible = true
        slot.active = true
      }
    }
  }

  private initGrass(): void {
    // Only consider textured grass-detail-* sprites (skip the procedural
    // Graphics fallback so we never rotate a Graphics node).
    const tufts = this.grass.children.filter(
      (c): c is Sprite =>
        c instanceof Sprite &&
        typeof c.label === "string" &&
        c.label.startsWith("grass-detail-"),
    )
    if (tufts.length === 0) return
    const counts = GRASS_TUFT_COUNTS[this.quality]
    const desired = Math.min(
      tufts.length,
      Math.round((counts[0] + counts[1]) / 2),
    )
    for (let i = 0; i < desired; i += 1) {
      const tuft = tufts[i]!
      this.grassTufts.push(tuft)
      this.grassPhases.push(this.rng.range(0, Math.PI * 2))
      this.grassBaseRotations.push(tuft.rotation)
    }
  }

  private updateGrass(windSample: number): void {
    const sweep = (GRASS_WIND_SWEEP_RANGE[0] + GRASS_WIND_SWEEP_RANGE[1]) / 2
    for (let i = 0; i < this.grassTufts.length; i += 1) {
      const tuft = this.grassTufts[i]!
      const phase = this.grassPhases[i]!
      const base = this.grassBaseRotations[i]!
      const t = this.elapsedMs / 1000
      // Wind adds a slow breathing on top of the tuft's phase.
      tuft.rotation =
        base +
        Math.sin(t * 1.4 + phase) * 0.04 +
        windSample * sweep * 0.45
    }
  }
}