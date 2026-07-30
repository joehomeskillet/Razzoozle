import type { ReactNode } from "react"

export interface CelebrationLayerProps {
  children?: ReactNode
  className?: string
}

export const CelebrationLayer = ({
  children,
  className = "",
}: CelebrationLayerProps) => (
  <div
    aria-hidden="true"
    className={`pointer-events-none ${className}`.trim()}
  >
    {children}
  </div>
)
