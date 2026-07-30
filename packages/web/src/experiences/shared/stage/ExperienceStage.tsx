import type { ExperienceStageProps } from "./experience-stage.types"

/**
 * ExperienceStage — outer container with stable aspect ratio (16:9).
 * Prevents horizontal overflow. Pure layout, no domain logic.
 *
 * `aspect-video` only constrains the box when height is otherwise indefinite
 * — every experience route is required to hand this component a definite
 * height through its ancestor chain (WP-958D pins that chain at the route
 * root, GameWrapper, following the `.display-kiosk` 100dvh contract), so the
 * aspect fallback never engages on presenter surfaces. No dvh ceiling lives
 * here: a max-height would also clamp legitimate definite-height fills
 * (e.g. the fullscreen kiosk) below their intended size.
 */
export const ExperienceStage = ({
  children,
  className = "",
}: ExperienceStageProps) => {
  return (
    <div
      className={`aspect-video overflow-x-hidden ${className}`}
      role="region"
      aria-label="Experience stage"
    >
      {children}
    </div>
  )
}
