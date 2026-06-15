import ActionFooter from "@razzoozle/web/components/ui/ActionFooter"
import type { ReactNode } from "react"

export interface StickyActionsProps {
  /** Action buttons rendered inside the bar (e.g. save / reset). */
  children: ReactNode
  className?: string
}

/**
 * Thin delegate — renders via {@link ActionFooter} so all callers
 * (ConfigTheme, ConfigAchievements, …) get the gapless footer automatically.
 * The public props/exports are unchanged; callers need no updates.
 */
const StickyActions = ({ children, className }: StickyActionsProps) => (
  <ActionFooter className={className}>{children}</ActionFooter>
)

export default StickyActions
