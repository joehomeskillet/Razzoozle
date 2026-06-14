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
  getGameConfig,
  getQuizzById,
  getSubmissionById,
  getSubmissions,
  getTheme,
  saveBackgroundImage,
  saveCatalogEntry,
  saveSubmission,
  setTheme,
  updateQuizz,
  updateSubmission,
} from "@razzia/socket/services/config"
import manager, { emitConfig } from "@razzia/socket/services/manager"
import {
  checkRateLimit,
  clearRateLimit,
} from "@razzia/socket/services/submissionRateLimit"
import { normalizeFilename } from "@razzia/socket/utils/game"
import { z } from "zod"

// AI-gen is a public, unauthenticated GPU op (venue submit). The ONLY DoS guard
// is this hard per-socket throttle: at most 1 request / 30 s AND at most 5 over
// the socket's lifetime. State is keyed by socket.id and GC'd on disconnect.
interface ImageGenState {
  last: number
  total: number
}

const imageGenStore = new Map<string, ImageGenState>()
const IMAGE_GEN_COOLDOWN_MS = 30_000
const IMAGE_GEN_MAX_PER_SOCKET = 5
const PROMPT_MAX_LEN = 300

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
    if (!checkRateLimit(socket.id)) {
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

      const now = Date.now()
      const state = imageGenStore.get(socket.id)

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

        state.last = now
        state.total += 1
      } else {
        imageGenStore.set(socket.id, { last: now, total: 1 })
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

  socket.on("disconnect", () => {
    clearRateLimit(socket.id)
    imageGenStore.delete(socket.id)
  })

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
    } catch (error) {
      console.error("Failed to read game config:", error)
      socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:failedToReadConfig")
    }
  })
}
