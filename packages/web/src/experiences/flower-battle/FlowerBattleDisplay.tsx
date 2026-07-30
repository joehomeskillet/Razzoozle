import type { ExperienceTransition } from "@razzoozle/common/types/game/experience"

import { CURRENT_GARDEN_RECIPE_VERSION } from "./background"
import { FlowerBattlePresenterHud } from "./FlowerBattlePresenterHud"
import { FlowerGardenScene } from "./FlowerGardenScene"
import { EXPERIENCE_Z_INDEX } from "../shared/stage/z-index"

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
      className="display-stage relative h-full w-full"
    >
      <FlowerGardenScene
        seed={state?.background.seed ?? 0}
        recipeVersion={state?.background.recipeVersion ?? CURRENT_GARDEN_RECIPE_VERSION}
        teams={teams}
      />
      <div
        data-testid="flower-battle-display-hud"
        className="absolute inset-0"
        style={{ zIndex: EXPERIENCE_Z_INDEX.hud }}
      >
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
