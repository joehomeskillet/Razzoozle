import type { ReactNode } from "react"

import type { ExperienceLayerName } from "./z-index"

export interface ExperienceStageProps {
  children?: ReactNode
  className?: string
}

export interface ExperienceViewportProps {
  children?: ReactNode
  className?: string
}

export interface ExperienceLayerProps {
  name: ExperienceLayerName
  children?: ReactNode
  className?: string
}

export interface ExperienceSafeAreaProps {
  children?: ReactNode
  className?: string
}
