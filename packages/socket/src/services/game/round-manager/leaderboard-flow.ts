// Leaderboard flow (showRoundRecap + showLeaderboard incl. the final-round
// FINISHED branch) — extracted verbatim from RoundManager (round-manager.ts,
// Modul 8 of the SRP split).
//
// Both functions run synchronously, so the ctx passes hot class state as
// call-time VALUES for reads (gameFinished/currentQuestion/roundRecapShown/
// autoMode/tempRoundRecap/tempOldLeaderboard) and explicit setter callbacks
// for the primitive/nullable fields the originals assigned (started,
// gameFinished, resultScreenActive, roundRecapShown, tempRoundRecap,
// tempOldLeaderboard). Maps/arrays (lastResultPayloads, leaderboard,
// recapStats, questionsHistory) come by reference and mutate in place.
// buildRecap/computeTeamStandings/showRoundRecap/send stay callbacks into the
// class (same pattern as auto-mode.ts).
import type {
  GameResult,
  ManagerRecap,
  Player,
  PlayerRecap,
  QuestionResult,
  Quizz,
  RoundRecapAward,
  TeamStanding,
} from "@razzoozle/common/types/game"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzoozle/common/types/game/status"
import { nanoid } from "nanoid"
import { emitLifecycle } from "@razzoozle/socket/services/plugin-runtime"
import { AUTO_LEADERBOARD_MS } from "@razzoozle/socket/services/game/round-manager/auto-mode"
import type { RecapStat } from "@razzoozle/socket/services/game/round-manager/snapshot"

type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

export interface ShowRoundRecapCtx {
  setResultScreenActive: (_v: boolean) => void
  lastResultPayloads: Map<string, StatusDataMap["SHOW_RESULT"]>
  setRoundRecapShown: (_v: boolean) => void
  send: SendFn
  getManagerId: () => string
  tempRoundRecap: RoundRecapAward[] | null
}

// Manager-only interstitial: the per-round recap highlights get their OWN
// full-screen page (reusing RecapSequence) BEFORE the leaderboard, instead of
// cramping the answer-reveal screen. Players are unaffected (they keep their
// inline recap on SHOW_RESULT). Only reached when tempRoundRecap is non-empty.
// Does NOT clear tempRoundRecap — showLeaderboard() still reads it for the
// SHOW_LEADERBOARD payload and clears it there.
export function showRoundRecap(ctx: ShowRoundRecapCtx): void {
  // Leaving the post-results screen — drop its FIX 8/9 bookkeeping so a late
  // setAutoMode(true) can't re-arm / re-send a screen that is gone.
  ctx.setResultScreenActive(false)
  ctx.lastResultPayloads.clear()
  ctx.setRoundRecapShown(true)
  ctx.send(ctx.getManagerId(), STATUS.SHOW_ROUND_RECAP, {
    roundRecap: ctx.tempRoundRecap ?? [],
  })
}

export interface ShowLeaderboardCtx {
  gameFinished: boolean
  setGameFinished: (_v: boolean) => void
  currentQuestion: number
  quizz: Quizz
  roundRecapShown: boolean
  tempRoundRecap: RoundRecapAward[] | null
  setTempRoundRecap: (_v: null) => void
  showRoundRecap: () => void
  setResultScreenActive: (_v: boolean) => void
  lastResultPayloads: Map<string, StatusDataMap["SHOW_RESULT"]>
  setStarted: (_v: boolean) => void
  leaderboard: Player[]
  recapStats: ReadonlyMap<string, RecapStat>
  buildRecap: (_finalRanks: Map<string, number>) => {
    manager: ManagerRecap
    perPlayer: Map<string, PlayerRecap>
  }
  questionsHistory: QuestionResult[]
  onGameFinished: (_result: GameResult) => void
  computeTeamStandings: () => TeamStanding[] | undefined
  send: SendFn
  getManagerId: () => string
  autoMode: boolean
  gameId: string
  tempOldLeaderboard: Player[] | null
  setTempOldLeaderboard: (_v: null) => void
}

export function showLeaderboard(ctx: ShowLeaderboardCtx): void {
  // Entry guard: the final round's branch below sets gameFinished right
  // before saving the result + emitting FINISHED. A second call that races
  // in afterwards (double SHOW_LEADERBOARD) must be a no-op instead of
  // re-running onGameFinished (duplicate result file + a second FINISHED
  // emit). Non-final rounds never set gameFinished, so this guard never
  // affects the round-recap-diversion behavior below.
  if (ctx.gameFinished) {
    return
  }

  // First hop off the answer-reveal screen: divert to the per-round recap
  // screen (its OWN full-screen page) when there is a non-empty recap that
  // has not been shown yet. NOT on the last round — that goes straight to
  // FINISHED / Podium, which owns the end-of-game recap.
  const isLastRoundForRecap =
    ctx.currentQuestion + 1 === ctx.quizz.questions.length
  if (
    !isLastRoundForRecap &&
    !ctx.roundRecapShown &&
    ctx.tempRoundRecap &&
    ctx.tempRoundRecap.length > 0
  ) {
    ctx.showRoundRecap()
    return
  }

  // We are leaving the post-results screen: drop its FIX 8/9 bookkeeping so a
  // late setAutoMode(true) can't re-arm / re-send a screen that is gone.
  ctx.setResultScreenActive(false)
  ctx.lastResultPayloads.clear()

  const isLastRound = ctx.currentQuestion + 1 === ctx.quizz.questions.length

  if (isLastRound) {
    ctx.setStarted(false)
    ctx.setGameFinished(true)

    // Attach FULL-GAME achievements onto the podium slice so the FINISHED
    // top[] can render medals. We STOP stripping achievements here: read each
    // top player's accumulated full-game badge set from recapStats (bots carry
    // none). Back-compat: players without an entry simply get no achievements.
    const top = ctx.leaderboard.slice(0, 3).map((p) => {
      const stat = ctx.recapStats.get(p.clientId)
      return stat && stat.achievementIds.length > 0
        ? { ...p, achievements: [...stat.achievementIds] }
        : { ...p }
    })

    // Final human ranks (1..N) keyed by clientId — matches the per-player emit
    // index+1 below and feeds each myRecap.rank.
    const finalRanks = new Map<string, number>()
    ctx.leaderboard
      .filter((p) => !p.isBot)
      .forEach((p, index) => {
        finalRanks.set(p.clientId, index + 1)
      })

    // Derive the recap ONCE (manager superlatives + per-player cards).
    const { manager: managerRecap, perPlayer: playerRecaps } =
      ctx.buildRecap(finalRanks)

    // Sim mode: the PERSISTED result must never carry bots (they would pollute
    // the real results archive / history UI). Mirror toSnapshot's filter here —
    // this saved-result path is independent of toSnapshot and reads the live
    // unfiltered arrays. Rank is computed over humans only (1..N). The live
    // FINISHED `top` display is intentionally left unfiltered (bots stay
    // visible during play, per the feature contract).
    const botUsernames = new Set(
      ctx.leaderboard.filter((p) => p.isBot).map((p) => p.username),
    )

    // Extract quiz ID from the quizz object (which is a QuizzWithId at runtime).
    const quizId = (ctx.quizz as any).id

    ctx.onGameFinished({
      id: `${Date.now()}-${nanoid(8)}`,
      subject: ctx.quizz.subject,
      date: new Date().toISOString(),
      players: ctx.leaderboard
        .filter((p) => !p.isBot)
        .map((player, index) => ({
          username: player.username,
          points: player.points,
          rank: index + 1,
        })),
      questions: ctx.questionsHistory.map((q) => ({
        ...q,
        playerAnswers: q.playerAnswers.filter(
          (a) => !botUsernames.has(a.playerName),
        ),
      })),
      // Persist the manager recap so the public share page can replay the
      // superlative reveal before the podium. Only when there are awards.
      ...(managerRecap && managerRecap.superlatives.length > 0
        ? { recap: managerRecap }
        : {}),
      // Include quiz ID so result-detail views can link back to the source quiz.
      ...(quizId ? { quizId } : {}),
    })

    // Team mode: final team standings (undefined when team mode is off, so the
    // optional payload field is simply absent in normal mode).
    const finalTeamStandings = ctx.computeTeamStandings()

    ctx.send(ctx.getManagerId(), STATUS.FINISHED, {
      subject: ctx.quizz.subject,
      top,
      ...(finalTeamStandings ? { teamStandings: finalTeamStandings } : {}),
      // MANAGER recap: the full awards list + hardest-question callout.
      recap: managerRecap,
      // Echo the auto-mode flag so the end-game screen knows the host advanced
      // automatically (client display-only; old clients ignore it).
      autoMode: ctx.autoMode,
    })
    emitLifecycle("onGameEnd", { gameId: ctx.gameId, status: "FINISHED", data: {} })

    ctx.leaderboard.forEach((player, index) => {
      // Bots have no real socket — emitting to a `bot:<id>` target would
      // pollute playerStatus + push to a nonexistent room. Skip the emit; the
      // index still advances so each human keeps its live (unfiltered)
      // `index + 1` rank, unchanged from before.
      if (player.isBot) {
        return
      }
      // PER-PLAYER recap: this player's own card + the single award they won
      // (if any). Bots carry no recap entry, so this is simply absent for them.
      const myPlayerRecap = ctx.recapStats.has(player.clientId)
        ? playerRecaps.get(player.clientId)
        : undefined
      ctx.send(player.id, STATUS.FINISHED, {
        subject: ctx.quizz.subject,
        top,
        rank: index + 1,
        ...(finalTeamStandings ? { teamStandings: finalTeamStandings } : {}),
        ...(myPlayerRecap ? { recap: myPlayerRecap } : {}),
      })
    })

    return
  }

  const oldLeaderboard = ctx.tempOldLeaderboard ?? ctx.leaderboard
  // Team mode: between-questions team standings (undefined when off → absent).
  const teamStandings = ctx.computeTeamStandings()

  ctx.send(ctx.getManagerId(), STATUS.SHOW_LEADERBOARD, {
    oldLeaderboard: oldLeaderboard.slice(0, 5),
    leaderboard: ctx.leaderboard.slice(0, 5),
    ...(teamStandings ? { teamStandings } : {}),
    // FIX 9: in auto-mode the leaderboard auto-advances to the next question
    // after AUTO_LEADERBOARD_MS — carry it so the client can render a local
    // countdown. Absent in manual mode (old clients ignore it).
    ...(ctx.autoMode ? { autoAdvanceMs: AUTO_LEADERBOARD_MS } : {}),
    ...(ctx.tempRoundRecap && ctx.tempRoundRecap.length > 0
      ? { roundRecap: ctx.tempRoundRecap }
      : {}),
  })
  emitLifecycle("onLeaderboard", { gameId: ctx.gameId, status: "SHOW_LEADERBOARD", data: {} })

  ctx.setTempOldLeaderboard(null)
  ctx.setTempRoundRecap(null)
}
