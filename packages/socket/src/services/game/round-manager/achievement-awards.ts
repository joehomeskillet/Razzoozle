// computeAchievementAwards — extracted verbatim from RoundManager.showResults
// (round-manager.ts, Modul 1 of the SRP split). Was an inline block operating
// on `this.X`; state now flows through the explicit `AchievementsCtx` (mutable
// maps, passed BY REFERENCE) and `ComputeAchievementAwardsParams` (the locals
// showResults had already computed earlier in the method). Logic UNCHANGED.
import type { AchievementId } from "@razzoozle/common/achievements"
import {
  achievementBonus,
  achievementEnabled,
  achievementThreshold,
} from "@razzoozle/socket/services/game/round-manager/achievement-config"
import type {
  AchievementsCtx,
  ComputeAchievementAwardsParams,
  ComputeAchievementAwardsResult,
} from "@razzoozle/socket/services/game/round-manager/achievement-awards-types"

// Computes per-player badge unlocks + folds in configurable bonus points.
// Verbatim port of the inline showResults block (RoundManager, Wave A/B) —
// only `this.X` accesses became `ctx.X` / helper-function calls; every other
// local (sortedPlayers, rankBefore, hasPriorRound, firstCorrectId,
// isLastScoredRound, totalScoredQuestions, question) is now a parameter
// instead of a closure-captured showResults local.
export function computeAchievementAwards(
  ctx: AchievementsCtx,
  params: ComputeAchievementAwardsParams,
): ComputeAchievementAwardsResult {
  const {
    sortedPlayers,
    currentPlayers,
    rankBefore,
    hasPriorRound,
    firstCorrectId,
    isLastScoredRound,
    totalScoredQuestions,
    question,
  } = params

  // ── Achievements: compute per player AFTER points/streak are finalized ────
  // rankAfter = 1-based index in the just-sorted list (FULL list, not top-5).
  // underdog needs every player's before/after totals, so we resolve them from
  // the sorted rows. Counters (answered/correct/everCorrect) are updated here,
  // surviving across rounds via ctx.gameCounters (+ snapshot/restore).
  const achievementsByClient = new Map<string, string[]>()

  sortedPlayers.forEach((row, index) => {
    // Bots never earn achievements and must not mutate the persistent
    // gameCounters (per the sim-mode contract: bots are excluded from
    // counters and badges in live play). Short-circuit before any mutation.
    if (row.isBot) {
      return
    }

    const rankAfter = index + 1
    const unlocked: string[] = []

    // Only a SCORED answer (non-poll, non-practice) can unlock anything. Poll/
    // practice rows still get the persistent counters left untouched.
    if (row.aScored) {
      const counter = ctx.gameCounters.get(row.clientId) ?? {
        answered: 0,
        correct: 0,
        ever: false,
      }
      const answeredThisRound = ctx.answerReceivedAt.has(row.clientId)
      // Count this round into the persistent per-player totals.
      const everBefore = counter.ever
      const nextCounter = {
        answered: counter.answered + (answeredThisRound ? 1 : 0),
        correct: counter.correct + (row.aIsCorrect ? 1 : 0),
        ever: counter.ever || row.aIsCorrect,
      }
      ctx.gameCounters.set(row.clientId, nextCounter)

      const rt = row.aResponseTimeMs

      // Push a badge only when it is enabled in the merged config. A disabled
      // badge is never unlocked even if its condition holds. Every condition
      // reads its numeric threshold from the merged config (clamped to the
      // registry range); the fallback is the SHIPPED default, so an empty/
      // missing config reproduces the previous hardcoded behaviour exactly.
      const award = (id: AchievementId, condition: boolean): void => {
        if (condition && achievementEnabled(ctx.achievementsConfig, id)) {
          unlocked.push(id)
        }
      }

      // ── Bronze ────────────────────────────────────────────────────────────
      // first_correct: this player's FIRST EVER correct answer in the game.
      award("first_correct", row.aIsCorrect && !everBefore)

      // lucky_guess: correct AND answered in the last `lastPercent`% of the
      // window (default 5 → rt >= 95% of the window in ms).
      const luckyLastPercent = achievementThreshold(
        ctx.achievementsConfig,
        "lucky_guess",
        5,
      )
      award(
        "lucky_guess",
        row.aIsCorrect &&
          rt !== null &&
          rt >= (1 - luckyLastPercent / 100) * question.time * 1000,
      )

      // participation: answered EVERY scored question. Awarded on the last
      // scored round once the running answered count reaches the scored total.
      award(
        "participation",
        isLastScoredRound &&
          totalScoredQuestions > 0 &&
          nextCounter.answered === totalScoredQuestions,
      )

      // ── Silver ────────────────────────────────────────────────────────────
      // speed_demon: correct in under `maxMs` (default 1000).
      const speedMaxMs = achievementThreshold(
        ctx.achievementsConfig,
        "speed_demon",
        1000,
      )
      award("speed_demon", row.aIsCorrect && rt !== null && rt < speedMaxMs)

      // streak_3: streak hit exactly the configured value (default 3).
      award(
        "streak_3",
        row.aStreakAfter ===
          achievementThreshold(ctx.achievementsConfig, "streak_3", 3),
      )

      // sharpshooter: slider question, correct, accuracy > `minAccuracyPct`%
      // (default 95 → baseFactor > 0.95).
      const sharpMinPct = achievementThreshold(
        ctx.achievementsConfig,
        "sharpshooter",
        95,
      )
      award(
        "sharpshooter",
        question.type === "slider" &&
          row.aIsCorrect &&
          row.aBaseFactor > sharpMinPct / 100,
      )

      // climber: moved up >= `minRanksUp` ranks vs the prior round (default 3,
      // skip round 1).
      const climberMinUp = achievementThreshold(
        ctx.achievementsConfig,
        "climber",
        3,
      )
      const climbedBefore = hasPriorRound
        ? rankBefore.get(row.clientId)
        : undefined
      award(
        "climber",
        climbedBefore !== undefined &&
          climbedBefore - rankAfter >= climberMinUp,
      )

      // ── Gold ──────────────────────────────────────────────────────────────
      // first_responder: the round's first correct answer (by arrival order).
      award(
        "first_responder",
        firstCorrectId !== null && row.clientId === firstCorrectId,
      )

      // streak_5 + perfect_round both fire at their configured streak (both
      // default 5). Each reads its own threshold so the manager can split them.
      award(
        "streak_5",
        row.aStreakAfter ===
          achievementThreshold(ctx.achievementsConfig, "streak_5", 5),
      )
      award(
        "perfect_round",
        row.aStreakAfter ===
          achievementThreshold(ctx.achievementsConfig, "perfect_round", 5),
      )

      // underdog: beat someone who was > `minPointsAhead` pts ahead pre-round
      // (default 2000) and now sits below this player.
      const underdogMinAhead = achievementThreshold(
        ctx.achievementsConfig,
        "underdog",
        2000,
      )
      award(
        "underdog",
        sortedPlayers.some(
          (other) =>
            other.clientId !== row.clientId &&
            other.aPointsBefore - row.aPointsBefore > underdogMinAhead &&
            row.aPointsAfter > other.aPointsAfter,
        ),
      )

      // ── Diamant ───────────────────────────────────────────────────────────
      // streak_10: streak hit exactly the configured value (default 10).
      award(
        "streak_10",
        row.aStreakAfter ===
          achievementThreshold(ctx.achievementsConfig, "streak_10", 10),
      )

      // speedy_gonzales: correct in under `maxMs` (default 400).
      const speedyMaxMs = achievementThreshold(
        ctx.achievementsConfig,
        "speedy_gonzales",
        400,
      )
      award(
        "speedy_gonzales",
        row.aIsCorrect && rt !== null && rt < speedyMaxMs,
      )

      // perfect_game: 100% correct over all scored questions (last scored round).
      award(
        "perfect_game",
        isLastScoredRound &&
          totalScoredQuestions > 0 &&
          nextCounter.correct === totalScoredQuestions,
      )
    }

    if (unlocked.length > 0) {
      // Defensive cap: never emit an unbounded list (≤ 20 per the spec).
      achievementsByClient.set(row.clientId, unlocked.slice(0, 20))
    }

    // ── RECAP accumulator (WP-A) ────────────────────────────────────────────
    // Fold THIS round's already-computed per-player fields into the persistent
    // scalar accumulator (bots are excluded — they returned at the top). Only a
    // SCORED row contributes to correctness/streak/timing/achievements; poll &
    // practice rows leave those untouched (mirrors gameCounters above).
    const recap = ctx.recapStats.get(row.clientId) ?? {
      username: row.username,
      fastestMs: null as number | null,
      peakStreak: 0,
      correct: 0,
      wrong: 0,
      answered: 0,
      bestClimb: 0,
      worstRankEver: index + 1,
      achievementCount: 0,
      achievementIds: [] as string[],
      luckyGuess: false,
    }
    // Keep the freshest display name (a player can rename mid-game).
    recap.username = row.username

    if (row.aScored) {
      const answeredThisRound = ctx.answerReceivedAt.has(row.clientId)
      const rt = row.aResponseTimeMs

      if (answeredThisRound) {
        recap.answered += 1
        if (rt !== null) {
          recap.fastestMs =
            recap.fastestMs === null ? rt : Math.min(recap.fastestMs, rt)
        }
      }

      if (row.aIsCorrect) {
        recap.correct += 1
      } else if (answeredThisRound) {
        // wrong = an actual incorrect submission (a no-show is neither).
        recap.wrong += 1
      }

      recap.peakStreak = Math.max(recap.peakStreak, row.aStreakAfter)

      // bestClimb: largest single-round upward rank move (only meaningful once
      // a prior round exists; rankBefore is empty on round 1 → no climb).
      const climbedFrom = hasPriorRound
        ? rankBefore.get(row.clientId)
        : undefined
      if (climbedFrom !== undefined) {
        recap.bestClimb = Math.max(recap.bestClimb, climbedFrom - rankAfter)
      }

      // worstRankEver: the lowest (highest-numbered) rank this player ever
      // held, tracked across rounds so comeback_kid can measure climb from the
      // nadir.
      recap.worstRankEver = Math.max(recap.worstRankEver, index + 1)

      // luckyGuess: a correct answer that landed in the last ~10% of the timer.
      if (row.aIsCorrect && rt !== null && rt >= 0.9 * question.time * 1000) {
        recap.luckyGuess = true
      }

      // Per-question correctness tally for hardest_question (non-bot only).
      const q = ctx.questionStats.get(ctx.currentQuestion) ?? {
        correct: 0,
        total: 0,
      }
      q.total += answeredThisRound ? 1 : 0
      q.correct += row.aIsCorrect ? 1 : 0
      ctx.questionStats.set(ctx.currentQuestion, q)
    }

    // Union the badges unlocked THIS round into the full-game set (capped) —
    // BEFORE achievements are stripped from the player below.
    if (unlocked.length > 0) {
      for (const id of unlocked) {
        if (!recap.achievementIds.includes(id)) {
          recap.achievementIds.push(id)
        }
      }
      recap.achievementCount += unlocked.length
      if (recap.achievementIds.length > 50) {
        recap.achievementIds = recap.achievementIds.slice(0, 50)
      }
    }

    ctx.recapStats.set(row.clientId, recap)
  })

  // ── Achievements: award configurable BONUS POINTS (Wave B) ────────────────
  // Second pass over the scored rows: sum each client's per-badge bonus over
  // the ids it just unlocked. When the sum > 0 we (1) add it to the LIVE player
  // object's `points` so any subsequent read of the roster stays consistent,
  // (2) fold it into the row's `points` + `lastPoints` so the SHOW_RESULT
  // payload (myPoints / +points) and the round leaderboard reflect the bonus,
  // and (3) record it in bonusByClient for the per-player SHOW_RESULT field.
  // Default bonus is 0 (registry holds no per-id bonus), so a config without
  // any bonus override leaves scoring byte-identical to the shipped behaviour.
  const bonusByClient = new Map<string, number>()

  for (const row of sortedPlayers) {
    // Bots never earn achievements (and so never any bonus) — skip entirely.
    if (row.isBot) {
      continue
    }

    const unlocked = achievementsByClient.get(row.clientId)

    if (!unlocked || unlocked.length === 0) {
      continue
    }

    const bonus = unlocked.reduce(
      (sum, id) =>
        sum + achievementBonus(ctx.achievementsConfig, id as AchievementId),
      0,
    )

    if (bonus > 0) {
      // (1) LIVE player object — find by durable clientId among the players
      // whose `points` was just mutated in the scoring map above.
      const livePlayer = currentPlayers.find(
        (p) => p.clientId === row.clientId,
      )

      if (livePlayer) {
        livePlayer.points += bonus
      }

      // (2) Row totals feeding SHOW_RESULT + the round leaderboard.
      row.points += bonus
      row.lastPoints += bonus

      // (3) Per-player bonus, surfaced as SHOW_RESULT.bonusPoints when > 0.
      bonusByClient.set(row.clientId, bonus)
    }
  }

  // RE-SORT after folding the bonus in so rank / aheadOf reflect the new totals.
  sortedPlayers.sort((a, b) => b.points - a.points)

  return { achievementsByClient, bonusByClient }
}
