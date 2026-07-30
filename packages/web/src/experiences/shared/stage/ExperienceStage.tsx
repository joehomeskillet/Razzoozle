import type { ExperienceStageProps } from "./experience-stage.types"

/**
 * ExperienceStage — outer container with stable aspect ratio (16:9).
 * Prevents horizontal overflow. Pure layout, no domain logic.
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
