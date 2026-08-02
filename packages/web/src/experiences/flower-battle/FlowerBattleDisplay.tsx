import type { CSSProperties } from "react"
import type { ExperienceTransition } from "@razzoozle/common/types/game/experience"

import { CURRENT_GARDEN_RECIPE_VERSION } from "./background"
import { FlowerBattlePresenterHud } from "./FlowerBattlePresenterHud"
import { GardenBattleCanvasHost } from "./GardenBattleCanvasHost"

export interface FlowerBattleDisplayProps {
  data: ExperienceTransition
}

/**
 * FlowerBattleDisplay — binds the live `game:experience` envelope
 * (mode=flowerBattle) to GardenBattleCanvasHost + FlowerBattlePresenterHud for
 * the beamer/kiosk display route (WP-939C / WP-PIX-05B). Content-free: reads
 * only teams/background/progress/phase from the payload, never question text.
 *
 * Immersive stage: full-bleed Pixi canvas at z=0; React HUD as absolute
 * overlays (pointer-events only on interactive chips). Parent
 * GameWrapper `presenterLayout="experience-immersive"` removes flow chrome
 * so the body cream field never shows beside/under the game.
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
  const phaseDurationMs = data.phaseDurationMs
  // FB-HUD5 / WP-B: always derive a safe non-negative seconds value so the
  // central timer stays visible for every value 20→0 and for transient
  // invalid payloads (undefined / NaN / negative). `0` is a valid render
  // state and signals "phase ended" to the audience without hiding the chip.
  const safeCountdownSeconds =
    typeof phaseDurationMs === "number" && Number.isFinite(phaseDurationMs) && phaseDurationMs > 0
      ? Math.ceil(phaseDurationMs / 1000)
      : 0
  const isFlowerBattleReadyPhase =
    state?.phase === "start" ||
    state?.phase === "greeting" ||
    state?.phase === "role_assignment"
  const seed = state?.background.seed ?? 0
  const recipeVersion =
    state?.background.recipeVersion ?? CURRENT_GARDEN_RECIPE_VERSION
  // Hide the timer only during pre-game / role-assignment phases — never on
  // data validity. During active question play (round1/2/3, voting, results)
  // the timer is always rendered so the audience can track the clock down to
  // 0 even through momentary wire glitches.
  const shouldShowCountdown = !isFlowerBattleReadyPhase

  return (
    <div
      data-testid="flower-battle-display"
      data-phase={data.phase}
      data-flower-battle-phase={state?.phase}
      data-phase-duration-ms={data.phaseDurationMs}
      data-presenter-layout="experience-immersive"
      className="display-stage relative h-full w-full overflow-hidden"
      style={
        {
          // Defaults when parent shell has not set the experience safe-area
          // contract (e.g. satellite without immersive presenterLayout).
          "--experience-safe-top": "4.75rem",
          "--experience-safe-bottom": "7.5rem",
          "--experience-safe-bottom-pad": "var(--experience-safe-bottom, 0.75rem)",
          "--experience-safe-left": "0.75rem",
          "--experience-safe-right": "0.75rem",
        } as CSSProperties
      }
    >
      {/* z=0 full-bleed game background — never a flow sibling under HUD */}
      <GardenBattleCanvasHost
        teams={teams}
        seed={seed}
        recipeVersion={recipeVersion}
        phase={data.phase}
        className="absolute inset-0 z-0 h-full w-full"
      />

      {/* Decorative atmospheric padding — no pointer capture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5]"
        data-testid="flower-battle-atmosphere-overlay"
      />

      {/* z=20 React HUD overlays — interactive chips re-enable pointer-events */}
      <div
        data-testid="flower-battle-display-hud"
        className="pointer-events-none absolute inset-0 z-20"
      >
        <FlowerBattlePresenterHud
          variant="overlay"
          teams={teams}
          sunPoints={{}}
          answerCounter={{ answered, total }}
          countdown={
            shouldShowCountdown
              ? {
                  seconds: safeCountdownSeconds,
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}

export default FlowerBattleDisplay
