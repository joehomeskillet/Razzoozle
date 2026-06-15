import {
  DEFAULT_MANAGER_PASSWORD,
  EVENTS,
  type ThemeSlot,
} from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import type { Submission } from "@razzia/common/types/submission"
import { questionValidator } from "@razzia/common/validators/quizz"
import { submissionValidator } from "@razzia/common/validators/submission"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { generateImage } from "@razzia/socket/services/comfyui"
import {
  assertSafeId,
  countPendingSubmissions,
  getAISettings,
  getGameConfig,
  getQuizzById,
  getSubmissionById,
  getSubmissions,
  getTheme,
  saveBackgroundImage,
  saveCatalogEntry,
  saveSubmission,
  setTheme,
  toPublicAISettings,
  updateQuizz,
  updateSubmission,
} from "@razzia/socket/services/config"
import manager, { emitConfig } from "@razzia/socket/services/manager"
import {
  checkGlobalSubmissionRate,
  checkImageGenHourlyLimit,
  checkRateLimit,
  PENDING_QUEUE_CAP,
} from "@razzia/socket/services/submissionRateLimit"
import { normalizeFilename } from "@razzia/socket/utils/game"
import { z } from "zod"

// The durable client identity from the handshake — same value manager auth keys
// on (see services/manager.ts#getClientId). Falls back to socket.id when absent
// so a client that never sends a clientId is still throttled (fail-safe: a
// missing id must never mean "unlimited").
const getClientId = (socket: SocketContext["socket"]): string =>
  (socket.handshake.auth.clientId as string | undefined) ?? socket.id

// AI-gen is a public, unauthenticated GPU op (venue submit). Guards: a short
// cooldown (1 / 30 s) AND a per-client lifetime cap, PLUS a durable hourly cap
// (services/submissionRateLimit#checkImageGenHourlyLimit). State is keyed by the
// DURABLE clientId (not socket.id) so a reconnect does NOT reset the cooldown,
// and entries self-expire by time window rather than on disconnect.
interface ImageGenState {
  last: number
  total: number
}

const imageGenStore = new Map<string, ImageGenState>()
const IMAGE_GEN_COOLDOWN_MS = 30_000
const IMAGE_GEN_MAX_PER_SOCKET = 5
const PROMPT_MAX_LEN = 300

// Lazy GC for the per-client cooldown/lifetime store: drop entries whose last
// activity is older than the hourly window so the Map cannot grow unbounded
// across many distinct clients (no per-socket leak, no disconnect cleanup).
const IMAGE_GEN_GC_MS = 3_600_000
const sweepImageGenStore = (now: number): void => {
  for (const [key, state] of imageGenStore) {
    if (now - state.last > IMAGE_GEN_GC_MS) {
      imageGenStore.delete(key)
    }
  }
}

// Reject prompts that look like leaked secrets (best-effort, intentionally
// simple — the real guard is that prompts never touch secret stores).
const SECRET_PATTERNS = [/sk-/i, /AKIA/, /BEGIN PRIVATE KEY/i]

export const managerSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.MANAGER.GET_CONFIG,
    manager.withAuth(socket, () => {
      emitConfig(socket)
    }),
  )

  // Public: any client (player or manager) may read the theme to apply it.
  socket.on(EVENTS.MANAGER.GET_THEME, () => {
    socket.emit(EVENTS.MANAGER.THEME, getTheme())
  })

  socket.on(
    EVENTS.MANAGER.SET_THEME,
    manager.withAuth(socket, (payload: unknown) => {
      try {
        const theme = setTheme(payload)
        socket.emit(EVENTS.MANAGER.SET_THEME_SUCCESS, theme)
        // Live-update every other connected client.
        socket.broadcast.emit(EVENTS.MANAGER.THEME, theme)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.THEME_ERROR,
          error instanceof Error ? error.message : "errors:theme.saveFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.UPLOAD_BACKGROUND,
    manager.withAuth(
      socket,
      async (payload: { slot: ThemeSlot; dataUrl: string }) => {
        try {
          const path = await saveBackgroundImage(payload.slot, payload.dataUrl)
          socket.emit(EVENTS.MANAGER.BACKGROUND_UPLOADED, {
            slot: payload.slot,
            path,
          })
        } catch (error) {
          socket.emit(
            EVENTS.MANAGER.THEME_ERROR,
            error instanceof Error
              ? error.message
              : "errors:theme.uploadFailed",
          )
        }
      },
    ),
  )

  // ── Public question submission (NO auth — venue submit) ───────────────────
  // Guards: per-socket throttle, full zod validation (incl. questionValidator
  // superRefine), assertSafeId on the persisted id. solutions are stored but
  // never broadcast to clients.
  socket.on(EVENTS.MANAGER.SUBMIT_QUESTION, (payload: unknown) => {
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
      if (countPendingSubmissions() >= PENDING_QUEUE_CAP) {
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
    }

    try {
      saveSubmission(submission)
    } catch {
      socket.emit(EVENTS.MANAGER.SUBMISSION_ERROR, "errors:submission.saveFailed")

      return
    }

    socket.emit(EVENTS.MANAGER.SUBMIT_SUCCESS)
  })

  // ── Public AI image generation (NO auth) ──────────────────────────────────
  // Hard-throttled GPU op: 1 / 30 s AND max 5 per socket lifetime. Prompt is
  // validated (string, 1..300) and secret-scanned before reaching ComfyUI.
  socket.on(EVENTS.MANAGER.GENERATE_IMAGE, (payload: unknown) => {
    void (async () => {
      const parsed = z
        .object({ prompt: z.string().min(1).max(PROMPT_MAX_LEN) })
        .safeParse(payload)

      if (!parsed.success) {
        socket.emit(EVENTS.MANAGER.IMAGE_ERROR, "errors:submission.promptInvalid")

        return
      }

      const prompt = parsed.data.prompt

      if (SECRET_PATTERNS.some((re) => re.test(prompt))) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.promptRejected",
        )

        return
      }

      // Keyed by the DURABLE clientId (not socket.id) so a reconnect does NOT
      // reset the cooldown / lifetime cap.
      const clientId = getClientId(socket)
      const now = Date.now()
      sweepImageGenStore(now)
      const state = imageGenStore.get(clientId)

      // Cooldown + per-client lifetime cap FIRST (these reject WITHOUT touching
      // the hourly counter). Burning hourly credits inside the 30s cooldown let
      // a spamming client self-lock the 10/h cap with zero successful gens, so
      // the durable hourly credit is consumed only on the dispatch path below.
      if (state) {
        if (now - state.last < IMAGE_GEN_COOLDOWN_MS) {
          socket.emit(
            EVENTS.MANAGER.IMAGE_ERROR,
            "errors:submission.imageRateLimited",
          )

          return
        }

        if (state.total >= IMAGE_GEN_MAX_PER_SOCKET) {
          socket.emit(
            EVENTS.MANAGER.IMAGE_ERROR,
            "errors:submission.imageLimitReached",
          )

          return
        }
      }

      // Durable hourly cap (GPU is expensive): keyed by clientId, survives
      // reconnect, self-expires after the hour. Consumed only here, on the path
      // that will actually dispatch, so a cooldown-rejected request never spends
      // an hourly credit.
      if (!checkImageGenHourlyLimit(clientId)) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.imageLimitReached",
        )

        return
      }

      if (state) {
        state.last = now
        state.total += 1
      } else {
        imageGenStore.set(clientId, { last: now, total: 1 })
      }

      try {
        const url = await generateImage(prompt)
        socket.emit(EVENTS.MANAGER.IMAGE_GENERATED, { url })
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          error instanceof Error ? error.message : "errors:submission.imageGenFailed",
        )
      }
    })()
  })

  // ── Admin (auth-gated) submission moderation ──────────────────────────────
  socket.on(
    EVENTS.MANAGER.LIST_SUBMISSIONS,
    manager.withAuth(socket, () => {
      socket.emit(EVENTS.MANAGER.SUBMISSIONS_DATA, getSubmissions())
    }),
  )

  socket.on(
    EVENTS.MANAGER.EDIT_SUBMISSION,
    manager.withAuth(socket, (payload: unknown) => {
      // questionValidator is a ZodEffects (.superRefine) so .partial() is not
      // available — admin edits submit the full corrected question object.
      const schema = z.object({ id: z.string(), question: questionValidator })
      const result = schema.safeParse(payload)

      if (!result.success) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          result.error.issues[0].message,
        )

        return
      }

      try {
        assertSafeId(result.data.id)
        updateSubmission(result.data.id, {
          question: result.data.question as Question,
        })
        emitConfig(socket)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          error instanceof Error ? error.message : "errors:submission.saveFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.APPROVE_SUBMISSION,
    manager.withAuth(socket, (payload: unknown) => {
      // Two destinations: append to an existing quizz (quizzId required) OR file
      // the submission into the reusable catalog (toCatalog: true).
      const schema = z.object({
        id: z.string(),
        quizzId: z.string().optional(),
        toCatalog: z.boolean().optional(),
      })
      const result = schema.safeParse(payload)

      if (!result.success) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          result.error.issues[0].message,
        )

        return
      }

      try {
        assertSafeId(result.data.id)

        const submission = getSubmissionById(result.data.id)

        if (!submission) {
          socket.emit(
            EVENTS.MANAGER.SUBMISSION_ERROR,
            "errors:submission.notFound",
          )

          return
        }

        // Approve-to-catalog: persist the question into the catalog (source
        // "submission") and mark the submission approved. Skip the quiz append.
        if (result.data.toCatalog === true) {
          saveCatalogEntry({
            question: submission.question,
            source: "submission",
          })

          updateSubmission(result.data.id, { status: "approved" })
          emitConfig(socket)

          return
        }

        // Append-to-quizz path (unchanged): quizzId is required here.
        if (!result.data.quizzId) {
          socket.emit(
            EVENTS.MANAGER.SUBMISSION_ERROR,
            "errors:submission.quizzNotFound",
          )

          return
        }

        assertSafeId(result.data.quizzId)

        const quizz = getQuizzById(result.data.quizzId)

        // Append the question with submittedBy preserved; updateQuizz runs
        // quizzValidator which keeps submittedBy (now optional on questionValidator).
        const updatedQuestion: Question = {
          ...submission.question,
          submittedBy: submission.submittedBy,
        }

        updateQuizz(result.data.quizzId, {
          subject: quizz.subject,
          questions: [...quizz.questions, updatedQuestion],
        })

        updateSubmission(result.data.id, { status: "approved" })
        emitConfig(socket)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          error instanceof Error
            ? error.message
            : "errors:submission.quizzNotFound",
        )
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.REJECT_SUBMISSION,
    manager.withAuth(socket, (payload: unknown) => {
      const schema = z.object({ id: z.string() })
      const result = schema.safeParse(payload)

      if (!result.success) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          result.error.issues[0].message,
        )

        return
      }

      try {
        assertSafeId(result.data.id)
        updateSubmission(result.data.id, { status: "rejected" })
        emitConfig(socket)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          error instanceof Error ? error.message : "errors:submission.notFound",
        )
      }
    }),
  )

  // NB: rate-limit / image-gen state is deliberately NOT cleared on disconnect.
  // Clearing it on disconnect was the reconnect-bypass (disconnect+reconnect
  // reset every quota). State is keyed by the durable clientId and self-expires
  // by time window (see services/submissionRateLimit + sweepImageGenStore), so
  // there is no per-socket leak and the quota survives a reconnect.

  socket.on(EVENTS.MANAGER.LOGOUT, () => {
    manager.logout(socket)
  })

  socket.on(EVENTS.MANAGER.AUTH, (password) => {
    try {
      const config = getGameConfig()

      if (config.managerPassword === DEFAULT_MANAGER_PASSWORD) {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.passwordNotConfigured",
        )

        return
      }

      if (password !== config.managerPassword) {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.invalidPassword",
        )

        return
      }

      manager.login(socket)
      emitConfig(socket)
      // Re-push AI settings on every successful auth (login + reconnect re-auth)
      // so the open KI tab repopulates after a server restart without the client
      // racing a withAuth GET_SETTINGS against re-auth. Public shape — no keys.
      socket.emit(EVENTS.AI.SETTINGS, toPublicAISettings(getAISettings()))
    } catch (error) {
      console.error("Failed to read game config:", error)
      socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:failedToReadConfig")
    }
  })
}
