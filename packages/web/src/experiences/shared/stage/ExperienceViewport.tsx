import type { ExperienceViewportProps } from "./experience-stage.types"

/**
 * ExperienceViewport — fit-to-screen wrapper with container-query-based scaling.
 * No domain logic. CSS container-type: inline-size for responsive scaling.
 */
export const ExperienceViewport = ({
  children,
  className = "",
}: ExperienceViewportProps) => {
  return (
    <div
      className={`@container h-screen w-full ${className}`}
      role="region"
      aria-label="Experience viewport"
    >
      {children}
    </div>
  )
}
