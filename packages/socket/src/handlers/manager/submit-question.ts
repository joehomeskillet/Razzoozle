import { EVENTS } from "@razzoozle/common/constants"
import type { Submission } from "@razzoozle/common/types/submission"
import { submissionValidator } from "@razzoozle/common/validators/submission"
import { getClientId } from "@razzoozle/socket/handlers/imageGenThrottle"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { saveSubmission } from "@razzoozle/socket/services/config"
import { countPendingSubmissions } from "@razzoozle/socket/services/storage/config-read"
import {
  checkGlobalSubmissionRate,
  checkRateLimit,
  PENDING_QUEUE_CAP,
} from "@razzoozle/socket/services/submissionRateLimit"
import { normalizeFilename } from "@razzoozle/socket/utils/game"

export const registerSubmitQuestionHandler = ({ socket }: SocketContext) => {
  // ── Public question submission (NO auth — venue submit) ───────────────────
  // Guards: per-socket throttle, full zod validation (incl. questionValidator
  // superRefine), assertSafeId on the persisted id. solutions are stored but
  // never broadcast to clients.
  socket.on(EVENTS.MANAGER.SUBMIT_QUESTION, async (payload: unknown) => {
    // Coarse server-wide ceiling FIRST: it has no per-user side effect, whereas
    // the per-client check below increments the user's counter. Checking the
    // global ceiling first means tripping it never burns a legit user's personal
    // 3/60s budget (defense-in-depth against many distinct clients flooding).
    if (!checkGlobalSubmissionRate()) {
      socket.emit(
        EVENTS.MANAGER.SUBMISSION_ERROR,
        "errors:submission.rateLimited",
      )

      return
    }

    // Per-client throttle keyed by the DURABLE clientId so a reconnect does NOT
    // reset the quota (socket.id changed on every reconnect → trivial bypass).
    if (!checkRateLimit(getClientId(socket))) {
      socket.emit(
        EVENTS.MANAGER.SUBMISSION_ERROR,
        "errors:submission.rateLimited",
      )

      return
    }

    const result = submissionValidator.safeParse(payload)

    if (!result.success) {
      socket.emit(
        EVENTS.MANAGER.SUBMISSION_ERROR,
        result.error.issues[0].message,
      )

      return
    }

    // Hard stop: if the moderation backlog is already at the cap, reject cleanly
    // instead of persisting. Fail-safe — if the count cannot be read we allow the
    // save (a counter bug must not lock out legitimate users). The cap is the
    // only place we hard-block on uncertainty-free, observed state.
    try {
      if ((await countPendingSubmissions()) >= PENDING_QUEUE_CAP) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          "errors:submission.queueFull",
        )

        return
      }
    } catch {
      // Could not read the queue — allow on uncertainty.
    }

    // normalizeFilename always produces SAFE_ID-conformant output; saveSubmission
    // additionally calls assertSafeId before any path interpolation.
    const id = normalizeFilename(result.data.question.question)

    const submission: Submission = {
      id,
      submittedBy: result.data.submittedBy,
      submittedAt: new Date().toISOString(),
      status: "pending",
      question: result.data.question,
      // WP-17 — a publicly-supplied category persists with the submission.
      ...(result.data.category !== undefined
        ? { category: result.data.category }
        : {}),
    }

    try {
      saveSubmission(submission)
    } catch {
      socket.emit(
        EVENTS.MANAGER.SUBMISSION_ERROR,
        "errors:submission.saveFailed",
      )

      return
    }

    socket.emit(EVENTS.MANAGER.SUBMIT_SUCCESS)
  })
}
