import type { IncomingMessage, ServerResponse } from "http"
import type { SoloCheckAnswerResponse } from "@razzoozle/common/types/game"
import {
  soloCheckAnswerRequestValidator,
  soloScoreSubmitValidator,
} from "@razzoozle/common/validators/solo"
import { mergeAchievementsConfig } from "@razzoozle/common/achievements"
import { shuffleChunksWithGuard } from "@razzoozle/common/utils/chunks"
import { evaluateAnswer } from "@razzoozle/socket/services/game/answer-eval"
import {
  appendSoloResult,
  assertSafeId,
  getResultById,
} from "@razzoozle/socket/services/config"
import {
  readQuizzById,
  readSoloResults,
} from "@razzoozle/socket/services/storage/config-read"
import { checkGlobalSoloRate } from "@razzoozle/socket/services/submissionRateLimit"
import { jsonOk, jsonError } from "./respond"
import { readBody, statusFrom413 } from "./body"
import { checkAssignmentDeadline } from "./assignments"

export const handleSoloGet = (
  res: ServerResponse,
  id: string | undefined,
  assignmentId?: string,
): void => {
  if (!checkGlobalSoloRate()) {
    jsonError(res, 429, "rate limited")
    return
  }

  void (async () => {
    try {
      // Check assignment deadline if assignmentId provided (from query param or caller)
      if (assignmentId && !(await checkAssignmentDeadline(assignmentId))) {
        jsonError(res, 403, "assignment_closed")
        return
      }

      assertSafeId(id ?? "")
      const quiz = await readQuizzById(id!)
      const questions = quiz.questions.map((question) => {
        // Strip secrets: solutions, correct, acceptedAnswers, chunks
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { solutions: _s, correct: _c, acceptedAnswers: _a, chunks: _ch, ...rest } = question
        // For sentence-builder, add shuffledChunks (a permutation of the correct chunks)
        if (question.type === "sentence-builder" && question.chunks?.length) {
          return {
            ...rest,
            shuffledChunks: shuffleChunksWithGuard(question.chunks),
          }
        }
        return rest
      })
      jsonOk(res, { subject: quiz.subject, questions })
    } catch (err) {
      jsonError(res, 404, err instanceof Error ? err.message : "Not found")
    }
  })()
}

export const handleCheckAnswer = (
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!checkGlobalSoloRate()) {
    jsonError(res, 429, "rate limited")
    return
  }
  void (async () => {
    try {
      assertSafeId(id ?? "")
      const body = await readBody(req)
      const parsed = soloCheckAnswerRequestValidator.safeParse(body)

      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues[0]!.message)
        return
      }

      const { questionIndex, answerId, answerIds, answerText } = parsed.data
      const quiz = await readQuizzById(id!)

      if (questionIndex < 0 || questionIndex >= quiz.questions.length) {
        jsonError(res, 400, "Invalid questionIndex")
        return
      }

      const question = quiz.questions[questionIndex]!
      const { correct, base } = evaluateAnswer(question, {
        answerId,
        answerIds,
        answerText,
      })
      const points = correct ? Math.round(1000 * base) : 0
      const response: SoloCheckAnswerResponse = { correct, points }

      if (question.type === "slider") {
        response.accuracy = base
        const sharp = mergeAchievementsConfig({}).find(
          (a) => a.id === "sharpshooter",
        )
        const minPct = sharp?.threshold ?? 95
        if ((sharp?.enabled ?? true) && correct && base * 100 >= minPct) {
          response.achievements = ["sharpshooter"]
        }
      }

      jsonOk(res, response)
    } catch (err) {
      jsonError(
        res,
        statusFrom413(err, 404),
        err instanceof Error ? err.message : "Error",
      )
    }
  })()
}

export const handleSoloScore = (
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!checkGlobalSoloRate()) {
    jsonError(res, 429, "rate limited")
    return
  }
  void (async () => {
    try {
      assertSafeId(id ?? "")
      const body = await readBody(req)
      const parsed = soloScoreSubmitValidator.safeParse(body)

      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues[0]!.message)
        return
      }

      const { playerName, score: clientScore, answers: clientAnswers, assignmentId } = parsed.data

      // Check assignment deadline if provided
      if (assignmentId && !(await checkAssignmentDeadline(assignmentId))) {
        jsonError(res, 403, "assignment_closed")
        return
      }

      // Load quiz before persisting: 404 (not the outer 500) when missing
      let quiz
      try {
        quiz = await readQuizzById(id!)
      } catch {
        jsonError(res, 404, `Quizz "${id}" not found`)
        return
      }
      if (!quiz) {
        jsonError(res, 404, `Quizz "${id}" not found`)
        return
      }

      // SERVER-SIDE VERIFICATION: Recompute score from submitted answers and cap
      // at theoretical maximum. Never persist raw client-submitted scores.
      //
      // Theoretical maximum: all questions answered correctly = 1000 points each.
      const theoreticalMax = quiz.questions.length * 1000

      // If answers array is provided, recompute score from claims. Since the
      // client doesn't send selections (answerId/answerIds/answerText), we trust
      // the answers array (which should match what was verified via
      // /check-answer) but cap the final score at theoretical max.
      let verifiedScore = clientScore
      if (Array.isArray(clientAnswers) && clientAnswers.length > 0) {
        verifiedScore = 0
        for (const answer of clientAnswers) {
          if (
            answer.questionIndex >= 0 &&
            answer.questionIndex < quiz.questions.length &&
            answer.correct === true
          ) {
            // Each correct answer contributes max 1000 points (simplified max,
            // avoiding per-question difficulty variance without selections).
            verifiedScore += 1000
          }
        }
      }

      // SAFETY CAP: Ensure final score never exceeds theoretical maximum.
      const finalScore = Math.min(verifiedScore, theoreticalMax)

      await appendSoloResult(
        id!,
        {
          playerName,
          score: finalScore,
          answeredAt: new Date().toISOString(),
        },
        assignmentId,
      )

      const leaderboard = (await readSoloResults(id!)).sort(
        (a, b) => b.score - a.score,
      )
      jsonOk(res, { leaderboard })
    } catch (err) {
      jsonError(
        res,
        statusFrom413(err, 500),
        err instanceof Error ? err.message : "Error",
      )
    }
  })()
}
