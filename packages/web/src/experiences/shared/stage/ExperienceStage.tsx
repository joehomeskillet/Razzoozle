import type { ExperienceStageProps } from "./experience-stage.types"

/**
 * ExperienceStage — outer container with stable aspect ratio (16:9).
 * Prevents horizontal overflow. Pure layout, no domain logic.
 *
 * WP-958D: `aspect-video` only constrains the box when height is otherwise
 * indefinite (e.g. a route whose ancestor chain never hands this component a
 * definite height) — it then derives height from width, which on a wide
 * route can outgrow the actual space and push the page into a vertical
 * scrollbar. `max-h-[70dvh]` is a dvh-based ceiling (independent of that
 * ancestor chain) so the fallback can never exceed a sane share of the
 * viewport; routes that already hand down a definite (smaller) height are
 * unaffected, since a max-height above the existing size is a no-op.
 */
export const ExperienceStage = ({
  children,
  className = "",
}: ExperienceStageProps) => {
  return (
    <div
      className={`aspect-video max-h-[70dvh] overflow-x-hidden ${className}`}
      role="region"
      aria-label="Experience stage"
    >
      {children}
    </div>
  )
}
