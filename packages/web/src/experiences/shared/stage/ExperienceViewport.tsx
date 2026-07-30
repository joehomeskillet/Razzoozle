import type { ExperienceViewportProps } from "./experience-stage.types"

/**
 * ExperienceViewport — fit-to-parent wrapper with container-query-based
 * scaling. No domain logic. CSS container-type: inline-size for responsive
 * scaling.
 *
 * Uses `h-full`, never `h-screen` (ADR-013): every display route (kiosk,
 * satellite, party/manager) already establishes its own `h-full`/`.display-
 * stage{height:100%}` chain down to this component's parent. `h-screen`
 * pins the box to 100dvh regardless of that parent's actual (often smaller)
 * box, which overflows it and causes the ancestor to scroll (WP-958B).
 */
export const ExperienceViewport = ({
  children,
  className = "",
}: ExperienceViewportProps) => {
  return (
    <div
      className={`@container h-full w-full ${className}`}
      role="region"
      aria-label="Experience viewport"
    >
      {children}
    </div>
  )
}
