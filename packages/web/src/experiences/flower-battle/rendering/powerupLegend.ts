/**
 * Powerup legend — passive observer strip at the bottom of the Flower Battle
 * scene (WP-PRESENTER-5). Shows the 4 power-up states (fertilizer, acid
 * rain, umbrella, sunbeam) as cream chips with an indicator dot that
 * highlights when the powerup is currently active.
 *
 * Read-only — never accepts pointer input. Lives in the `layer-presenter-hud`
 * Container. Bottom-edge placement keeps it below the actor band so it never
 * covers any flower meter.
 */

import { Container, Graphics, Text } from "pixi.js"
import type { TextStyleOptions } from "pixi.js"

import { getThemeTokenCssVar } from "@razzoozle/common/theme-tokens"

import { resolveThemeTokenColor, type ThemeColorResolver } from "./resolveThemeColor"
import { GARDEN_LOGICAL_HEIGHT, GARDEN_LOGICAL_WIDTH } from "./gardenViewport"

const LEGEND_CHIP_WIDTH = 168
const LEGEND_CHIP_HEIGHT = 44
const LEGEND_GAP = 14
const LEGEND_BOTTOM_MARGIN = 56
const LEGEND_INDICATOR_RADIUS = 7

export const POWERUP_KINDS = [
  "fertilizer",
  "acid_rain",
  "umbrella_shield",
  "sunbeam",
] as const

export type PowerupKind = (typeof POWERUP_KINDS)[number]

export const POWERUP_LEGEND_TOKENS = {
  chipFill: "--color-field-cream",
  chipText: "--color-field-ink",
  indicatorIdle: "--surface-muted",
  indicatorActive: "--color-accent",
} as const

export interface PowerupLegendPalette {
  chipFill: number
  chipText: number
  indicatorIdle: number
  indicatorActive: number
}

export function resolvePowerupLegendPalette(
  resolveColor: ThemeColorResolver = resolveThemeTokenColor,
): PowerupLegendPalette {
  return {
    chipFill: resolveColor(POWERUP_LEGEND_TOKENS.chipFill),
    chipText: resolveColor(POWERUP_LEGEND_TOKENS.chipText),
    indicatorIdle: resolveColor(POWERUP_LEGEND_TOKENS.indicatorIdle),
    indicatorActive: resolveColor(POWERUP_LEGEND_TOKENS.indicatorActive),
  }
}

export interface PowerupLegendLabels {
  fertilizer: string
  acid_rain: string
  umbrella_shield: string
  sunbeam: string
}

export interface PowerupLegendOptions {
  palette: PowerupLegendPalette
  labels: PowerupLegendLabels
  /** Optional: index → active flag. Defaults to all idle. */
  initialActive?: Partial<Record<PowerupKind, boolean>>
}

/**
 * Build the compact legend strip. The returned container is pre-positioned
 * centered along the bottom edge of the logical viewport. Callers can call
 * `legend.setActive(kind, active)` to update the indicator without rebuilding
 * the strip.
 */
export function buildPowerupLegend(options: PowerupLegendOptions): Container {
  const { palette, labels, initialActive = {} } = options
  const container = new Container()
  container.label = "powerup-legend"
  container.position.set(
    GARDEN_LOGICAL_WIDTH / 2,
    GARDEN_LOGICAL_HEIGHT - LEGEND_BOTTOM_MARGIN,
  )

  const totalWidth = LEGEND_CHIP_WIDTH * POWERUP_KINDS.length + LEGEND_GAP * (POWERUP_KINDS.length - 1)
  const startX = -totalWidth / 2

  const chips: Container[] = []
  POWERUP_KINDS.forEach((kind, index) => {
    const chip = new Container()
    chip.label = `powerup-legend-chip-${kind}`
    const x = startX + index * (LEGEND_CHIP_WIDTH + LEGEND_GAP)
    chip.position.set(x, 0)

    const bg = new Graphics()
    bg.label = "powerup-legend-chip-bg"
    bg.roundRect(
      -LEGEND_CHIP_WIDTH / 2,
      -LEGEND_CHIP_HEIGHT / 2,
      LEGEND_CHIP_WIDTH,
      LEGEND_CHIP_HEIGHT,
      LEGEND_CHIP_HEIGHT / 2,
    )
    bg.fill({ color: palette.chipFill })
    bg.stroke({ color: palette.chipText, width: 1, alpha: 0.18 })
    chip.addChild(bg)

    const indicator = new Graphics()
    indicator.label = "powerup-legend-chip-indicator"
    indicator.circle(
      -LEGEND_CHIP_WIDTH / 2 + 18,
      0,
      LEGEND_INDICATOR_RADIUS,
    )
    const active = Boolean(initialActive[kind])
    indicator.fill({
      color: active ? palette.indicatorActive : palette.indicatorIdle,
    })
    chip.addChild(indicator)

    const label = new Text({
      text: labels[kind],
      style: {
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: "600",
        fill: palette.chipText,
        align: "left",
      } satisfies TextStyleOptions,
    })
    label.anchor.set(0, 0.5)
    label.position.set(-LEGEND_CHIP_WIDTH / 2 + 36, 0)
    label.label = "powerup-legend-chip-label"
    chip.addChild(label)

    container.addChild(chip)
    chips.push(chip)
    // Stash the indicator on the chip for cheap updates.
    ;(chip as Container & { __indicator?: Graphics }).__indicator = indicator
  })

  function setActive(kind: PowerupKind, active: boolean): void {
    const idx = POWERUP_KINDS.indexOf(kind)
    if (idx < 0) return
    const chip = chips[idx]
    if (!chip) return
    const indicator = (chip as Container & { __indicator?: Graphics }).__indicator
    if (!indicator) return
    indicator.clear()
    indicator.circle(
      -LEGEND_CHIP_WIDTH / 2 + 18,
      0,
      LEGEND_INDICATOR_RADIUS,
    )
    indicator.fill({
      color: active ? palette.indicatorActive : palette.indicatorIdle,
    })
  }

  ;(container as Container & { setActive?: typeof setActive }).setActive = setActive

  return container
}

export function getPowerupLegendTokenCssVar(
  token: keyof typeof POWERUP_LEGEND_TOKENS,
): string {
  return getThemeTokenCssVar(POWERUP_LEGEND_TOKENS[token])
}
