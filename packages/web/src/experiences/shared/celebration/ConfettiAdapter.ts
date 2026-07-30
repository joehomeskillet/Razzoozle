import type { CssTokenName } from "@razzoozle/common/theme-tokens"
import {
  fireCenterSalvo,
  fireFullScreenBurst,
  fireTierConfetti,
} from "@razzoozle/web/features/game/utils/confetti"
import { getTokenCanvasRgba } from "@razzoozle/web/features/theme/hyperShaderTokenSync"

import type { ExperienceEffectColorRole } from "../types/experience-effect"
import type { CelebrationRequest } from "./celebration.types"

type CelebrationAdapter = (
  request: CelebrationRequest,
  reduced: boolean,
) => Promise<void>

const COLOR_ROLE_TOKENS: Record<ExperienceEffectColorRole, CssTokenName> = {
  primary: "--color-primary",
  secondary: "--color-secondary",
  accent: "--color-accent",
  success: "--state-correct",
  correct: "--state-correct",
  warning: "--timer-urgent",
  error: "--state-wrong",
  wrong: "--state-wrong",
  neutral: "--ink",
  info: "--team-blue",
  muted: "--ink-muted",
}

function resolveColors(
  roles: ExperienceEffectColorRole[] | undefined,
): string[] | undefined {
  if (!roles?.length) return undefined
  return roles.map((role) => getTokenCanvasRgba(COLOR_ROLE_TOKENS[role]))
}

const achievementAdapter: CelebrationAdapter = async (request, reduced) => {
  await fireTierConfetti(request.achievementIds ?? [], reduced)
}

const centerSalvoAdapter: CelebrationAdapter = async (request, reduced) => {
  await fireCenterSalvo(reduced, resolveColors(request.colorRoles))
}

// Shared full-window burst for both "award-reveal" (SharePage) and "game-win"
// (Podium, issue 918) — both want the same full-screen, non-recycling
// canvas-confetti pass; only the semantic kind name differs per caller.
const fullScreenBurstAdapter: CelebrationAdapter = async (
  request,
  reduced,
) => {
  await fireFullScreenBurst(reduced, {
    colors: resolveColors(request.colorRoles),
    zIndex: request.zIndex,
  })
}

const ADAPTERS = new Map<string, CelebrationAdapter>([
  ["achievement", achievementAdapter],
  ["center-salvo", centerSalvoAdapter],
  ["award-reveal", fullScreenBurstAdapter],
  ["game-win", fullScreenBurstAdapter],
])

export async function dispatchCelebration(
  request: CelebrationRequest,
  reduced: boolean,
): Promise<void> {
  const adapter = ADAPTERS.get(request.kind)
  if (!adapter) return
  await adapter(request, reduced)
}
