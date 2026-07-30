export type ExperienceTimelineInput = {
  revision: number
  phaseStartedAt: string
  phaseDurationMs: number | null
  serverNow?: string
}

export type ExperienceTimelineResult = {
  elapsedMs: number
  remainingMs: number | null
  normalizedProgress: number | null
  hasFinished: boolean
  shouldSkipIntro: boolean
}
