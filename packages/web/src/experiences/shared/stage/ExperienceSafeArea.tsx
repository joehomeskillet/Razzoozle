import type { ExperienceSafeAreaProps } from "./experience-stage.types"

/**
 * ExperienceSafeArea — applies safe-area-insets padding.
 * Uses CSS env(safe-area-inset-*) or mapped token equivalent.
 */
export const ExperienceSafeArea = ({
  children,
  className = "",
}: ExperienceSafeAreaProps) => {
  return (
    <div
      className={`p-[env(safe-area-inset-top,0)] pr-[env(safe-area-inset-right,0)] pb-[env(safe-area-inset-bottom,0)] pl-[env(safe-area-inset-left,0)] ${className}`.trim()}
      role="region"
      aria-label="Safe area"
    >
      {children}
    </div>
  )
}
