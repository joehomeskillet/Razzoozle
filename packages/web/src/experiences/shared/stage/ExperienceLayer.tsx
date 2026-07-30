import type { ExperienceLayerProps } from "./experience-stage.types"
import { EXPERIENCE_Z_INDEX } from "./z-index"

/**
 * ExperienceLayer — named layer within the stage.
 * name must be one of: background | actors | effects | hud | overlay.
 * effects layer has pointer-events:none; hud/overlay are interactive.
 * Z-index sourced from z-index.ts (single source of truth).
 */
export const ExperienceLayer = ({
  name,
  children,
  className = "",
}: ExperienceLayerProps) => {
  const zIndex = EXPERIENCE_Z_INDEX[name]
  const isEffects = name === "effects"

  return (
    <div
      style={{ zIndex }}
      className={`${isEffects ? "pointer-events-none" : ""} ${className}`.trim()}
      role={name === "overlay" ? "region" : undefined}
      aria-label={`${name} layer`}
    >
      {children}
    </div>
  )
}
