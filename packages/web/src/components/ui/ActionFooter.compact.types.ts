import type { ReactNode } from "react"

/**
 * AF-compact (WP-0 contract). Canonical name lives here and on
 * `TabDef.actionFooterVariant` in `features/manager/components/configurations/index.tsx`.
 * Keep both definitions byte-identical — downstream WPs import from either side.
 */
export type ActionFooterVariant = "default" | "compact"

/**
 * Single icon-only action rendered by `CompactIconBar`. 44×44 touch target,
 * token-only coloring, aria-label required for i18n parity.
 */
export interface CompactIconBarAction {
  /** Stable identity — also used for `data-action-key` and aria-controls. */
  key: string
  /** Lucide icon name. The bar resolves this to a component; we keep it as a literal
   *  here to keep this type module React-free. */
  iconName: "Play" | "Pause" | "SkipForward" | "Eye" | "Minus" | "Plus"
  /** Pre-translated label rendered into `aria-label` (i18n parity). */
  label: string
  /** When true, `active` reflects the toggled-on state and the bar styles it as pressed. */
  toggle?: boolean
  /** Pressed-state hint (only meaningful when `toggle` is true). */
  active?: boolean
  /** Click handler. Bar suppresses click when `disabled` is true. */
  onClick: () => void
  /** Disabled state — bar keeps the slot visible but non-interactive. */
  disabled?: boolean
}

/**
 * CompactIconBar — icon-only footer for tabs that opted into
 * `actionFooterVariant: "compact"`. Renders as a horizontal 44px-tall bar
 * with a leading slot, N action slots, and a trailing slot. Honors
 * `prefers-reduced-motion` for state transitions.
 */
export interface CompactIconBarProps {
  /** Ordered actions. Order = visual order (leading → trailing). */
  actions: readonly CompactIconBarAction[]
  /** Optional leading slot (e.g. status badge, count chip). */
  leading?: ReactNode
  /** Optional trailing slot (e.g. overflow trigger, save indicator). */
  trailing?: ReactNode
  /** Extra className applied to the outer bar. */
  className?: string
  /**
   * Unique instance id. Required so the host registry can detect
   * double-registration (AF04 contract). Tabs derive this from their `key`
   * + a stable suffix.
   */
  instanceId: string
}