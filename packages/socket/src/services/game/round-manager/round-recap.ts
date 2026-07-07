// Per-round recap awards — extracted verbatim from RoundManager
// (round-manager.ts, Modul 1 of the SRP split). This was a private method
// with ZERO `this.` dependencies (a pure function of its arguments already),
// so no ctx is needed — only the `private` keyword and `this.` receiver moved.
import type {
  RoundRecapAward,
  RoundRecapKey,
} from "@razzoozle/common/types/game"

// Build up to 3 game-wide RoundRecapAward highlights for THIS round from the
// already-computed per-player intermediate rows (the aXxx fields + rankBefore
// + the freshly-unlocked achievements). Bots are excluded. Awards are picked
// by the SPEC priority list; we prefer variety (a clientId already used as a
// winner is de-prioritised but allowed when nothing else qualifies). Returns
// an empty array when nothing qualifies — the caller then omits the field so
// old clients are unaffected. NEVER throws.
export function computeRoundRecap(
  rows: ReadonlyArray<{
    clientId: string
    username: string
    avatar?: string
    isBot?: boolean
    aIsCorrect: boolean
    aResponseTimeMs: number | null
    aStreakAfter: number
    lastPoints: number
    answeredThisRound: boolean
  }>,
  rankAfterByClient: ReadonlyMap<string, number>,
  rankBefore: ReadonlyMap<string, number>,
  achievementsByClient: ReadonlyMap<string, string[]>,
  firstCorrectId: string | null,
  hasPriorRound: boolean,
): RoundRecapAward[] {
  try {
    // Only non-bot players are eligible for any highlight.
    const eligible = rows.filter((r) => !r.isBot)
    if (eligible.length === 0) {
      // ponytail: no human players this round — nothing to highlight.
      return []
    }

    const awards: RoundRecapAward[] = []
    const used = new Set<string>()

    const findRow = (clientId: string) =>
      eligible.find((r) => r.clientId === clientId)

    // Push one award if a winning row exists; prefer a not-yet-used winner but
    // accept an already-used one rather than skipping a real highlight. The
    // `pick` callback resolves the winning row (or null) given a candidate set.
    const add = (
      key: RoundRecapKey,
      candidates: ReadonlyArray<{ clientId: string; metric: number }>,
      order: "max" | "min",
      value: (metric: number) => number | undefined,
    ): void => {
      if (awards.length >= 3 || candidates.length === 0) {
        return
      }
      const better = (a: number, b: number) =>
        order === "max" ? a > b : a < b
      // Prefer a fresh winner; fall back to the best overall if all are used.
      const pickFrom = (
        pool: ReadonlyArray<{ clientId: string; metric: number }>,
      ): { clientId: string; metric: number } | null => {
        let best: { clientId: string; metric: number } | null = null
        for (const c of pool) {
          if (best === null || better(c.metric, best.metric)) {
            best = c
          }
        }
        return best
      }
      const fresh = candidates.filter((c) => !used.has(c.clientId))
      const winner = pickFrom(fresh) ?? pickFrom(candidates)
      if (winner === null) {
        return
      }
      const row = findRow(winner.clientId)
      if (row === undefined) {
        return
      }
      const v = value(winner.metric)
      awards.push({
        key,
        winnerName: row.username,
        ...(row.avatar !== undefined ? { winnerAvatar: row.avatar } : {}),
        ...(v !== undefined ? { value: v } : {}),
      })
      used.add(winner.clientId)
    }

    // 1. fastest_finger — correct answerer, smallest response time (ms).
    add(
      "fastest_finger",
      eligible
        .filter((r) => r.aIsCorrect && r.aResponseTimeMs !== null)
        .map((r) => ({
          clientId: r.clientId,
          metric: r.aResponseTimeMs!,
        })),
      "min",
      (ms) => ms,
    )

    // 2. first_correct — first correct answerer this round (arrival order). No value.
    if (
      awards.length < 3 &&
      firstCorrectId !== null &&
      findRow(firstCorrectId) !== undefined
    ) {
      add(
        "first_correct",
        [{ clientId: firstCorrectId, metric: 0 }],
        "max",
        () => undefined,
      )
    }

    // 3. streak — highest current streak >= 2 (value = streak length).
    add(
      "streak",
      eligible
        .filter((r) => r.aStreakAfter >= 2)
        .map((r) => ({ clientId: r.clientId, metric: r.aStreakAfter })),
      "max",
      (n) => n,
    )

    // 4. highest_round_score — most points gained THIS round (> 0).
    add(
      "highest_round_score",
      eligible
        .filter((r) => r.lastPoints > 0)
        .map((r) => ({ clientId: r.clientId, metric: r.lastPoints })),
      "max",
      (n) => n,
    )

    // 5. rank_climber — biggest positive rank improvement vs pre-round order.
    if (hasPriorRound) {
      const climbers: { clientId: string; metric: number }[] = []
      for (const r of eligible) {
        const before = rankBefore.get(r.clientId)
        const after = rankAfterByClient.get(r.clientId)
        if (before !== undefined && after !== undefined) {
          const climbed = before - after
          if (climbed > 0) {
            climbers.push({ clientId: r.clientId, metric: climbed })
          }
        }
      }
      add("rank_climber", climbers, "max", (n) => n)
    } else {
      // ponytail: round 1 has no pre-round order — rank_climber is meaningless.
    }

    // 6. achievement_unlock — a player who unlocked an achievement this round. No value.
    if (awards.length < 3) {
      const unlockers: { clientId: string; metric: number }[] = []
      for (const r of eligible) {
        const got = achievementsByClient.get(r.clientId)
        if (got !== undefined && got.length > 0) {
          unlockers.push({ clientId: r.clientId, metric: got.length })
        }
      }
      add("achievement_unlock", unlockers, "max", () => undefined)
    }

    // 7. slowest_player (filler) — largest response time among answerers (ms).
    add(
      "slowest_player",
      eligible
        .filter((r) => r.answeredThisRound && r.aResponseTimeMs !== null)
        .map((r) => ({
          clientId: r.clientId,
          metric: r.aResponseTimeMs!,
        })),
      "max",
      (ms) => ms,
    )

    // 8. most_wrong (filler) — per-round this is 0/1 wrong per player, so the
    // count is 1 for any wrong answerer; surfaced only as a last-resort filler.
    add(
      "most_wrong",
      eligible
        .filter((r) => r.answeredThisRound && !r.aIsCorrect)
        .map((r) => ({ clientId: r.clientId, metric: 1 })),
      "max",
      (n) => n,
    )

    return awards.slice(0, 3)
  } catch {
    // ponytail: recap is best-effort — any unexpected error yields no awards
    // and the caller omits the field (old clients keep working).
    return []
  }
}
