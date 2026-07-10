/**
 * RoundRecap — the per-round recap highlights on their OWN full-screen manager
 * presentation page, shown BETWEEN the answer reveal (Responses) and the
 * leaderboard. It is a thin shell that mounts the shared `RecapSequence` with
 * the round's awards (the SAME card-by-card screen the end-of-game recap uses,
 * one component / two data sources), so it is 1:1 the same look + interaction.
 *
 * The host advances to the leaderboard with the GameWrapper "Weiter" button
 * (which emits MANAGER.SHOW_LEADERBOARD — the server interposes this screen, so
 * the first SHOW_LEADERBOARD lands here and the second proceeds to the board).
 * In auto-mode the server owns the dwell + advance. `onComplete` (final 🏆 cue)
 * is therefore a no-op here — no client-side navigation needed.
 *
 * Manager-only: players never receive SHOW_ROUND_RECAP (they keep their inline
 * recap on SHOW_RESULT).
 */

import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import RecapSequence from "@razzoozle/web/features/game/components/RecapSequence"

interface Props {
  data: ManagerStatusDataMap["SHOW_ROUND_RECAP"]
}

const RoundRecap = ({ data: { roundRecap } }: Props) => {
  return (
    <div data-testid="round-recap" className="relative flex h-full w-full flex-1 flex-col">
      <RecapSequence roundAwards={roundRecap} />
    </div>
  )
}

export default RoundRecap
