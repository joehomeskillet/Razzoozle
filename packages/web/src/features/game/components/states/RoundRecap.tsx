/**
 * RoundRecap — the per-round recap highlights on their OWN full-screen manager
 * presentation page, shown BETWEEN the answer reveal (Responses) and the
 * leaderboard. It is a thin shell that mounts the shared `RecapSequence` with
 * the round's awards (the SAME card-by-card screen the end-of-game recap uses,
 * one component / two data sources), so it is 1:1 the same look + interaction.
 *
 * GameWrapper hides its own toolbar "Weiter" button while SHOW_ROUND_RECAP is
 * active (SDD §17.2 — exactly one advance action), so RecapSequence's own
 * final-cue completion is the host's ONLY way off this screen. `onComplete`
 * therefore wires up the SAME advance the toolbar button would otherwise have
 * emitted for this status (MANAGER_SKIP_EVENTS[SHOW_ROUND_RECAP] in
 * utils/constants.ts): MANAGER.SHOW_LEADERBOARD — the server interposes this
 * screen, so the first SHOW_LEADERBOARD (from SHOW_RESPONSES) lands here and
 * this second one proceeds to the actual leaderboard. RecapSequence guards its
 * `onComplete` call to fire at most once per mount (auto-timer + the
 * final-cue button can both be in flight), so a stray double-click can't
 * double-emit. In auto-mode the server still owns the dwell pacing between
 * rounds; this only governs the client-side hand-off once the recap ends.
 *
 * Manager-only: players never receive SHOW_ROUND_RECAP (they keep their inline
 * recap on SHOW_RESULT) — RoundRecap is only wired into
 * GAME_STATE_COMPONENTS_MANAGER, never the player-shared base map.
 */

import { EVENTS } from "@razzoozle/common/constants"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import RecapSequence from "@razzoozle/web/features/game/components/RecapSequence"
import { useCallback } from "react"

interface Props {
  data: ManagerStatusDataMap["SHOW_ROUND_RECAP"]
}

const RoundRecap = ({ data: { roundRecap } }: Props) => {
  const { socket } = useSocket()
  const { gameId } = useManagerStore()

  const handleComplete = useCallback(() => {
    if (!gameId) return
    socket.emit(EVENTS.MANAGER.SHOW_LEADERBOARD, { gameId })
  }, [socket, gameId])

  return (
    <div data-testid="round-recap" className="relative flex h-full w-full flex-1 flex-col">
      <RecapSequence roundAwards={roundRecap} onComplete={handleComplete} />
    </div>
  )
}

export default RoundRecap
