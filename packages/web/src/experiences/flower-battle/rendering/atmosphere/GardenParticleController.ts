/**
 * Garden particle + grass-wind controller.
 *
 * Owns three pools:
 *   - Motes: persistent drifters inside `ambient`. Wind adds a per-frame
 *     dx/dy on top of the base velocity. Lifetime 5–10 s, recycled.
 *   - Gust leaves: short-lived bursts during a positive gust window
 *     (wind sample ≥ activation threshold). Quality ≥ medium only.
 *     FU-O: each leaf now follows a ballistic motion model — linear
 *     drag on vy, rotation-driven lift factor, angular drag, and a
 *     stuck-detection that retires leaves that have fallen past 55 %
 *     of the canvas height for ≥ 2 s.
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
  GUST_LEAF_EDGE_INSET,
  GUST_LEAF_LIFETIME_RANGE,
  GUST_LEAF_MID_COUNT,
  GUST_LEAF_SCALE_RANGE,
  GUST_LEAF_VEIN_SCALE_RATIO,
  GUST_LEAF_VEIN_TINT_FACTOR,
  GRASS_TUFT_COUNTS,
  GRASS_WIND_SWEEP_RANGE,
  LEAF_DRAG_K,
  LEAF_FLIGHT_ANG_VEL_RANGE,
  LEAF_FLIGHT_BASE_V_RANGE,
  LEAF_FLIGHT_BASE_VY_RANGE,
  LEAF_FLIGHT_SPAWN_BASE_Y_RANGE,
  LEAF_FLIGHT_STUCK_DURATION,
  LEAF_FLIGHT_STUCK_THRESHOLD,
  LEAF_GRAVITY,
  LEAF_ROT_DRAG_K,
  LEAF_ROTATION_LIFT,
  MOTE_BASE_SPEED_RANGE,
  MOTE_LIFETIME_RANGE,
  MOTE_MID_COUNT,
  MOTE_SCALE_RANGE,
  MOTE_ALPHA_RANGE,
  MOTE_Y_BAND,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"
import type { GardenRenderQuality } from "../../garden-pixi.types"
import type { GardenPalette } from "../gardenPalette"
import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
} from "./garden-atmosphere.constants"

export interface GardenParticleControllerOptions {
  seed?: number
  quality: GardenRenderQuality
  reducedMotion?: boolean
  ambient: Container
  grass: Container
  moteTexture?: Texture | null
  windLeafTextures?: readonly Texture[]
  /** Resolved palette — used to tint motes and gust leaves so they
   *  read as green/foliage, not the source PNG's raw white fill. */
  palette: GardenPalette
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
  sprite: Container
  /** Constant horizontal velocity (px/s) for the lifetime of the leaf. */
  vx: number
  /** Vertical velocity (px/s). Decays under drag and grows under
   *  gravity modulated by the spin-driven lift factor. */
  vy: number
  /** Angular velocity (rad/s). Decays under angular drag. */
  angVel: number
  /** Y anchor — the leaf's starting currentY inside the spawn band. */
  baseY: number
  /** Travel direction (-1 = left, +1 = right). Drives vx sign. */
  direction: 1 | -1
  /** Live horizontal position (px). */
  currentX: number
  /** Live vertical position (px). */
  currentY: number
  /** Live rotation (rad). */
  currentRotation: number
  ageSec: number
  lifetimeSec: number
  /** Seconds spent above the stuck threshold. Resets when currentY
   *  drops back below it. FU-O. */
  stuckSec: number
  active: boolean
}

interface VeinTextureResult {
  texture: Texture
  owned: boolean
}

function createVeinTexture(): VeinTextureResult {
  if (typeof document !== "undefined") {
    let canvasTexture: Texture | null = null
    try {
      const canvas = document.createElement("canvas")
      canvas.width = 8
      canvas.height = 64
      const context = canvas.getContext("2d")
      if (context) {
        context.fillStyle = "white"
        context.fillRect(3, 0, 2, 64)
        canvasTexture = Texture.from(canvas, true)
      }
    } catch {
      canvasTexture = null
    }
    if (canvasTexture) return { texture: canvasTexture, owned: true }
  }

  try {
    const pixels = new Uint8Array(8 * 64 * 4)
    for (let y = 0; y < 64; y += 1) {
      const offset = (y * 8 + 3) * 4
      const next = offset + 4
      pixels[offset] = 255
      pixels[offset + 1] = 255
      pixels[offset + 2] = 255
      pixels[offset + 3] = 255
      if (next + 4 <= pixels.length) {
        pixels[next] = 255
        pixels[next + 1] = 255
        pixels[next + 2] = 255
        pixels[next + 3] = 255
      }
    }
    return {
      texture: Texture.from(
        { resource: pixels, width: 8, height: 64 },
        true,
      ),
      owned: true,
    }
  } catch {
    return { texture: Texture.WHITE, owned: false }
  }
}

function darkenColor(color: number, factor: number): number {
  const red = Math.round(((color >> 16) & 0xff) * factor)
  const green = Math.round(((color >> 8) & 0xff) * factor)
  const blue = Math.round((color & 0xff) * factor)
  return (red << 16) | (green << 8) | blue
}

export class GardenParticleController {
  private readonly rng: SeededRandom
  private readonly quality: GardenRenderQuality
  private readonly reducedMotion: boolean
  private readonly ambient: Container
  private readonly grass: Container
  private readonly moteTexture: Texture | null
  private readonly windLeafTextures: readonly Texture[]
  private readonly palette: GardenPalette
  private veinTexture: Texture | null = null
  private veinTextureOwned = false
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
    this.palette = options.palette
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

  getVeinTexture(): Texture {
    if (!this.veinTexture) {
      const generated = createVeinTexture()
      this.veinTexture = generated.texture
      this.veinTextureOwned = generated.owned
    }
    return this.veinTexture
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
      slot.sprite.destroy({ children: true })
    }
    this.gustLeaves.length = 0
    if (
      this.veinTextureOwned &&
      this.veinTexture &&
      !this.veinTexture.destroyed
    ) {
      this.veinTexture.destroy(true)
    }
    this.veinTexture = null
    this.veinTextureOwned = false
    for (let i = 0; i < this.grassTufts.length; i += 1) {
      this.grassTufts[i]!.rotation = this.grassBaseRotations[i]!
    }
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
      sprite.tint = this.palette.foreground
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
    if (this.reducedMotion) return
    if (this.quality === "low" || this.quality === "static") return
    const count = GUST_LEAF_MID_COUNT[this.quality]
    if (count === 0) return
    if (this.windLeafTextures.length === 0) return
    // FU-J: each leaf picks a tint from a multi-green palette so the
    // gust reads as natural foliage rather than a single hue. The
    // tints come from the resolved GardenPalette channels; null
    // channels fall back to foreground so the pool never renders
    // un-tinted. (FU-K: expanded to 6 channels — palette.foreground,
    // midground, plantLeaf, grass, bushBack, hillMid — so the larger
    // 6-variant leaf set reads as a natural spectrum rather than a
    // single hue band.)
    const tints: number[] = [
      this.palette.foreground,
      this.palette.midground,
      this.palette.plantLeaf,
      this.palette.grass,
      this.palette.bushBack,
      this.palette.hillMid,
    ]
    for (let i = 0; i < count; i += 1) {
      const tex = this.windLeafTextures[i % this.windLeafTextures.length]!
      const container = new Container()
      container.label = `gust-leaf-${i}`
      const body = new Sprite(tex)
      body.label = `gust-leaf-body-${i}`
      body.anchor.set(0.5, 0.5)
      const tintIndex = this.rng.rangeInt(0, tints.length - 1)
      const bodyTint = tints[tintIndex]!
      body.tint = bodyTint
      const scale = this.rng.range(
        GUST_LEAF_SCALE_RANGE[0],
        GUST_LEAF_SCALE_RANGE[1],
      )
      body.scale.set(scale)

      const vein = new Sprite(this.getVeinTexture())
      vein.label = `gust-leaf-vein-${i}`
      vein.anchor.set(0.5, 0.5)
      vein.tint = darkenColor(bodyTint, GUST_LEAF_VEIN_TINT_FACTOR)
      vein.scale.set(scale * GUST_LEAF_VEIN_SCALE_RATIO)
      vein.position.set(0, 0)

      container.addChild(body, vein)
      container.visible = false
      this.ambient.addChild(container)
      this.gustLeaves.push({
        sprite: container,
        vx: 0,
        vy: 0,
        angVel: 0,
        baseY: 0,
        direction: 1,
        currentX: 0,
        currentY: 0,
        currentRotation: 0,
        ageSec: 0,
        lifetimeSec: 0,
        stuckSec: 0,
        active: false,
      })
    }
  }

  private updateGustLeaves(dt: number, windSample: number): void {
    if (this.gustLeaves.length === 0) return
    const activeGust = windSample >= GUST_LEAF_ACTIVATION_THRESHOLD
    for (const slot of this.gustLeaves) {
      if (slot.active) {
        // FU-O ballistic integration:
        //   dragFactor = exp(-LEAF_DRAG_K * dt)
        //   liftFactor = clamp(1 - |angVel| * LEAF_ROTATION_LIFT, 0.05, 1)
        //   vy = vy * dragFactor + LEAF_GRAVITY * liftFactor * dt
        //   angVel *= exp(-LEAF_ROT_DRAG_K * dt)
        //   currentX += vx * dt; currentY += vy * dt
        //   currentRotation += angVel * dt
        const dragFactor = Math.exp(-LEAF_DRAG_K * dt)
        const liftFactor = Math.min(
          1,
          Math.max(0.05, 1 - Math.abs(slot.angVel) * LEAF_ROTATION_LIFT),
        )
        slot.vy =
          slot.vy * dragFactor + LEAF_GRAVITY * liftFactor * dt
        slot.angVel = slot.angVel * Math.exp(-LEAF_ROT_DRAG_K * dt)
        slot.currentX += slot.vx * dt
        slot.currentY += slot.vy * dt
        slot.currentRotation += slot.angVel * dt
        slot.ageSec += dt

        // Mirror state onto the sprite.
        slot.sprite.x = slot.currentX
        slot.sprite.y = slot.currentY
        slot.sprite.rotation = slot.currentRotation
        slot.sprite.visible = true

        // Stuck detection: a leaf whose currentY has been above the
        // threshold for ≥ LEAF_FLIGHT_STUCK_DURATION seconds is
        // retired so the pool can spawn a fresh crossing.
        const stuckY = LEAF_FLIGHT_STUCK_THRESHOLD * ATMOSPHERE_HEIGHT
        if (slot.currentY > stuckY) {
          slot.stuckSec += dt
        } else {
          slot.stuckSec = 0
        }

        // Retire when the leaf has cleared the canvas horizontally
        // (with 60 px margin), its lifetime has elapsed, or the
        // stuck detector has fired.
        const margin = 60
        const offRight =
          slot.direction === 1 && slot.currentX > ATMOSPHERE_WIDTH + margin
        const offLeft =
          slot.direction === -1 && slot.currentX < -margin
        if (
          slot.ageSec >= slot.lifetimeSec ||
          offRight ||
          offLeft ||
          slot.stuckSec >= LEAF_FLIGHT_STUCK_DURATION
        ) {
          slot.active = false
          slot.sprite.visible = false
        }
      } else if (activeGust) {
        // FU-O spawn: startX at screen edge, vx sign follows direction,
        // vy / angVel / baseY / currentRotation sampled from the new
        // ballistic ranges.
        const fromLeft = this.rng.next() < 0.5
        const startX = fromLeft
          ? -GUST_LEAF_EDGE_INSET
          : ATMOSPHERE_WIDTH + GUST_LEAF_EDGE_INSET
        slot.direction = fromLeft ? 1 : -1
        const speed = this.rng.range(
          LEAF_FLIGHT_BASE_V_RANGE[0],
          LEAF_FLIGHT_BASE_V_RANGE[1],
        )
        slot.vx = speed * slot.direction
        slot.vy = this.rng.range(
          LEAF_FLIGHT_BASE_VY_RANGE[0],
          LEAF_FLIGHT_BASE_VY_RANGE[1],
        )
        slot.angVel = this.rng.range(
          LEAF_FLIGHT_ANG_VEL_RANGE[0],
          LEAF_FLIGHT_ANG_VEL_RANGE[1],
        )
        const baseYFrac = this.rng.range(
          LEAF_FLIGHT_SPAWN_BASE_Y_RANGE[0],
          LEAF_FLIGHT_SPAWN_BASE_Y_RANGE[1],
        )
        slot.baseY = baseYFrac * ATMOSPHERE_HEIGHT
        slot.lifetimeSec = this.rng.range(
          GUST_LEAF_LIFETIME_RANGE[0],
          GUST_LEAF_LIFETIME_RANGE[1],
        )
        slot.ageSec = 0
        slot.stuckSec = 0
        slot.currentX = startX
        slot.currentY = slot.baseY
        slot.currentRotation = 0
        slot.sprite.position.set(slot.currentX, slot.currentY)
        slot.sprite.rotation = 0
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