// Post-game recap / awards derivation (WP-A) — buildRecap extracted verbatim
// from RoundManager (round-manager.ts, Modul 7 of the SRP split).
//
// Pure read of the persistent recapStats/questionStats accumulators plus the
// (cleaned) round leaderboard — all three are class-held Maps/arrays passed by
// reference, never mutated here, so no setter callbacks are needed. RecapStat/
// QuestionStat are reused from snapshot.ts (Modul 2), which already declared
// them structurally identical to the class's inline field types.
import type {
  ManagerRecap,
  Player,
  PlayerRecap,
  Superlative,
  SuperlativeKey,
} from "@razzoozle/common/types/game"
import type {
  QuestionStat,
  RecapStat,
} from "@razzoozle/socket/services/game/round-manager/snapshot"

// Reduce the per-player recap accumulator into the manager-side superlatives
// list + per-player recap cards. Pure read of recapStats/questionStats — call
// ONCE at game end. Returns the manager payload, a per-clientId player payload
// map, and a per-clientId map of the single superlative that player won (for
// the phone highlight). Bots are already absent from recapStats.
export function buildRecap(
  ctx: {
    recapStats: ReadonlyMap<string, RecapStat>
    questionStats: ReadonlyMap<number, QuestionStat>
    leaderboard: Player[]
  },
  finalRanks: Map<string, number>,
): {
  manager: ManagerRecap
  perPlayer: Map<string, PlayerRecap>
} {
  const entries = [...ctx.recapStats.entries()]
  // clientId -> avatar lookup for superlative winner cards. The cleaned round
  // leaderboard rows carry avatar (bug #4 fix); recapStats does not, so we map
  // it here once and attach it to each award below.
  const avatarByClient = new Map<string, string | undefined>()
  for (const p of ctx.leaderboard) {
    avatarByClient.set(p.clientId, p.avatar)
  }

  // argmax/argmin helpers over the non-bot entries. A superlative is only
  // produced when at least one entry qualifies (predicate true) AND the best
  // value clears the floor (e.g. nobody climbed → no biggest_climber).
  const award = (
    key: SuperlativeKey,
    pick: (stat: (typeof entries)[number][1]) => number | null,
    better: (a: number, b: number) => boolean,
    floor?: (value: number) => boolean,
  ): { clientId: string; superlative: Superlative } | null => {
    let bestId: string | null = null
    let bestVal = 0
    let bestName = ""
    for (const [clientId, stat] of entries) {
      const v = pick(stat)
      if (v === null) {
        continue
      }
      if (bestId === null || better(v, bestVal)) {
        bestId = clientId
        bestVal = v
        bestName = stat.username
      }
    }
    if (bestId === null) {
      return null
    }
    if (floor && !floor(bestVal)) {
      return null
    }
    return {
      clientId: bestId,
      superlative: {
        key,
        winnerName: bestName,
        winnerAvatar: avatarByClient.get(bestId),
        value: bestVal,
      },
    }
  }

  const max = (a: number, b: number): boolean => a > b
  const min = (a: number, b: number): boolean => a < b

  const winners: Array<{
    clientId: string
    superlative: Superlative
  } | null> = [
    // fastest_finger: lowest single-answer time (only players who answered).
    award("fastest_finger", (s) => s.fastestMs, min),
    // most_correct: highest correct count (skip if nobody got any right).
    award(
      "most_correct",
      (s) => s.correct,
      max,
      (v) => v > 0,
    ),
    // most_wrong (playful): highest wrong count (skip if nobody was wrong).
    award(
      "most_wrong",
      (s) => s.wrong,
      max,
      (v) => v > 0,
    ),
    // longest_streak: highest peak streak (skip if nobody built one).
    award(
      "longest_streak",
      (s) => s.peakStreak,
      max,
      (v) => v > 0,
    ),
    // biggest_climber: largest single-round upward rank move.
    award(
      "biggest_climber",
      (s) => s.bestClimb,
      max,
      (v) => v > 0,
    ),
    // lucky_guesser: a player who landed a correct answer in the last ~10%.
    award(
      "lucky_guesser",
      (s) => (s.luckyGuess ? s.correct : null),
      max,
      (v) => v > 0,
    ),
    // most_achievements: highest full-game badge count (skip if zero).
    award(
      "most_achievements",
      (s) => s.achievementIds.length,
      max,
      (v) => v > 0,
    ),
  ]

  const superlatives: Superlative[] = []
  const highlightByClient = new Map<
    string,
    { key: SuperlativeKey; value: number }
  >()

  for (const w of winners) {
    if (!w) {
      continue
    }
    superlatives.push(w.superlative)
    // First award a player wins becomes their phone highlight (one card).
    if (!highlightByClient.has(w.clientId)) {
      highlightByClient.set(w.clientId, {
        key: w.superlative.key,
        value: w.superlative.value,
      })
    }
  }

  // comeback_kid: argmax of (worstRankEver - finalRank) — how far a player
  // climbed from their lowest-ever rank to their final standing. Distinct from
  // biggest_climber (largest single-ROUND jump). Needs finalRanks, so it can't
  // use the generic award() helper. Skip if nobody net-improved.
  let comeback: { clientId: string; superlative: Superlative } | null = null
  let bestComeback = 0
  for (const [clientId, stat] of entries) {
    const finalRank = finalRanks.get(clientId)
    if (finalRank === undefined) {
      continue
    }
    const climb = stat.worstRankEver - finalRank
    if (comeback === null || climb > bestComeback) {
      comeback = {
        clientId,
        superlative: {
          key: "comeback_kid",
          winnerName: stat.username,
          winnerAvatar: avatarByClient.get(clientId),
          value: climb,
        },
      }
      bestComeback = climb
    }
  }
  if (comeback !== null && bestComeback > 0) {
    superlatives.push(comeback.superlative)
    if (!highlightByClient.has(comeback.clientId)) {
      highlightByClient.set(comeback.clientId, {
        key: comeback.superlative.key,
        value: comeback.superlative.value,
      })
    }
  }

  // hardest_question: the SCORED question with the lowest correct% (>=1 answer).
  // Quiz-level award — winnerName is the human 1-based question label.
  let hardest: { questionIndex: number; correctPct: number } | undefined
  for (const [index, q] of ctx.questionStats) {
    if (q.total <= 0) {
      continue
    }
    const pct = Math.round((q.correct / q.total) * 100)
    if (hardest === undefined || pct < hardest.correctPct) {
      hardest = { questionIndex: index, correctPct: pct }
    }
  }
  if (hardest !== undefined) {
    superlatives.push({
      key: "hardest_question",
      winnerName: `#${hardest.questionIndex + 1}`,
      value: hardest.correctPct,
    })
  }

  const manager: ManagerRecap = {
    superlatives,
    ...(hardest !== undefined ? { hardestQuestion: hardest } : {}),
  }

  // Per-player recap cards.
  const perPlayer = new Map<string, PlayerRecap>()
  for (const [clientId, stat] of entries) {
    const answered = stat.answered
    const accuracyPct =
      answered > 0 ? Math.round((stat.correct / answered) * 100) : 0
    const myRecap: PlayerRecap["myRecap"] = {
      rank: finalRanks.get(clientId) ?? 0,
      accuracyPct,
      correct: stat.correct,
      wrong: stat.wrong,
      fastestMs: stat.fastestMs,
      peakStreak: stat.peakStreak,
      achievements: [...stat.achievementIds],
    }
    const highlight = highlightByClient.get(clientId)
    perPlayer.set(clientId, {
      myRecap,
      ...(highlight ? { highlight } : {}),
    })
  }

  return { manager, perPlayer }
}
