import type { ExperienceTransition } from "@razzoozle/common/types/game/experience"

import { CURRENT_GARDEN_RECIPE_VERSION } from "./background"
import { FlowerBattlePresenterHud } from "./FlowerBattlePresenterHud"
import { FlowerGardenScene } from "./FlowerGardenScene"

export interface FlowerBattleDisplayProps {
  data: ExperienceTransition
}

/**
 * FlowerBattleDisplay — binds the live `game:experience` envelope
 * (mode=flowerBattle) to FlowerGardenScene + FlowerBattlePresenterHud for the
 * beamer/kiosk display route (WP-939C). Content-free: reads only
 * teams/background/progress from the payload, never question/answer text.
 *
 * Purely presentational — no local state. Every render reflects exactly the
 * latest envelope prop, so a reconnect that hands in a fresh envelope never
 * shows a stale mid-animation snapshot.
 *
 * WP-958C: scene and HUD stack as flex-column flow children (scene flex-1
 * min-h-0, HUD shrink-0) instead of an absolute-inset overlay. The overlay
 * relied on `.display-stage` resolving a definite height from its ancestor
 * chain; on routes where that chain is indefinite (e.g. /party/manager),
 * the absolutely positioned HUD fell back to its static position and
 * rendered its natural content height *below* the scene, pushing the
 * team-meter row past the viewport fold. Flow children can never escape
 * their flex container's box regardless of that chain.
 */
export function FlowerBattleDisplay({ data }: FlowerBattleDisplayProps) {
  const state =
    data.payload?.mode === "flowerBattle" ? data.payload.data?.state : undefined
  const teams = state?.teams ?? []
  const answered = data.answered ?? 0
  const total = data.total ?? 0

  return (
    <div
      data-testid="flower-battle-display"
      data-phase={data.phase}
      data-flower-battle-phase={state?.phase}
      data-phase-duration-ms={data.phaseDurationMs}
      className="display-stage flex h-full w-full flex-col overflow-hidden"
    >
      <FlowerGardenScene
        seed={state?.background.seed ?? 0}
        recipeVersion={state?.background.recipeVersion ?? CURRENT_GARDEN_RECIPE_VERSION}
        teams={teams}
        className="min-h-0 flex-1"
      />
      <div data-testid="flower-battle-display-hud" className="shrink-0">
        <FlowerBattlePresenterHud
          teams={teams}
          sunPoints={{}}
          answerCounter={{ answered, total }}
        />
      </div>
    </div>
  )
}

export default FlowerBattleDisplay
