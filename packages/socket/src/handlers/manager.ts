import {
  DEFAULT_MANAGER_PASSWORD,
  EVENTS,
  PROMPT_MAX_LEN,
  SUBMISSION_CATEGORIES,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import type { EndGamePayload, Question } from "@razzoozle/common/types/game"
import type { Submission } from "@razzoozle/common/types/submission"
import { questionValidator } from "@razzoozle/common/validators/quizz"
import { submissionValidator } from "@razzoozle/common/validators/submission"
import {
  getClientId,
  SECRET_PATTERNS,
  tryConsumeImageGenCredit,
} from "@razzoozle/socket/handlers/imageGenThrottle"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { enhancePrompt } from "@razzoozle/socket/services/ai-provider"
import { generateImage } from "@razzoozle/socket/services/comfyui"
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
  setSkeletonAsset,
  setTheme,
  toPublicAISettings,
  updateQuizz,
  updateSubmission,
} from "@razzoozle/socket/services/config"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"
import Registry from "@razzoozle/socket/services/registry"
import {
  checkGlobalSubmissionRate,
  checkRateLimit,
  PENDING_QUEUE_CAP,
} from "@razzoozle/socket/services/submissionRateLimit"
import { normalizeFilename } from "@razzoozle/socket/utils/game"
import { z } from "zod"

export const managerSocketHandlers = ({ socket }: SocketContext) => {
  const registry = Registry.getInstance()

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
    EVENTS.MANAGER.SET_SKELETON_ASSET,
    manager.withAuth(
      socket,
      (payload: { kind: "css" | "js"; content: string }) => {
        try {
          if (payload?.kind !== "css" && payload?.kind !== "js") {
            throw new Error("errors:skeleton.invalidKind")
          }

          if (typeof payload.content !== "string") {
            throw new Error("errors:skeleton.invalidContent")
          }

          const theme = setSkeletonAsset(payload.kind, payload.content)
          socket.broadcast.emit(EVENTS.MANAGER.THEME, theme)
          socket.emit(EVENTS.MANAGER.THEME, theme)
          socket.emit(EVENTS.MANAGER.SET_SKELETON_ASSET_SUCCESS, {
            kind: payload.kind,
          })
        } catch (error) {
          socket.emit(
            EVENTS.MANAGER.THEME_ERROR,
            error instanceof Error ? error.message : "errors:theme.saveFailed",
          )
        }
      },
    ),
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
      // WP-17 — a publicly-supplied category persists with the submission.
      ...(result.data.category !== undefined
        ? { category: result.data.category }
        : {}),
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

      // Cooldown + per-client lifetime + durable hourly check, consuming a
      // credit on the dispatch path. Keyed by the DURABLE clientId (not
      // socket.id) so a reconnect does NOT reset the limits. SHARES the same
      // store as EDIT_IMAGE (see handlers/imageGenThrottle.ts) — behaviour is
      // byte-identical to the previous inline logic.
      const credit = tryConsumeImageGenCredit(getClientId(socket))

      if (!credit.ok) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          credit.errorKey ?? "errors:submission.imageLimitReached",
        )

        return
      }

      // Server-internal prompt-enhance (#23 §1.2): rewrite the raw idea into an
      // optimized Z-Image prompt BEFORE generation. Enhancement must NEVER block
      // image-gen — on ANY failure (provider Off, timeout, missing model, secret
      // output) fall back to the raw prompt. Re-secret-scan the enhanced string
      // (a model could echo a key-shaped token); fall back to raw if it does.
      let finalPrompt = prompt
      try {
        finalPrompt = await enhancePrompt(prompt)

        if (SECRET_PATTERNS.some((re) => re.test(finalPrompt))) {
          finalPrompt = prompt
        }
      } catch {
        finalPrompt = prompt
      }

      try {
        const url = await generateImage(finalPrompt)
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

  // ── Running-games admin panel (auth-gated) ────────────────────────────────
  // List every live game as a compact summary (no quiz content / solutions).
  socket.on(
    EVENTS.MANAGER.LIST_GAMES,
    manager.withAuth(socket, () => {
      socket.emit(
        EVENTS.MANAGER.GAMES_DATA,
        registry.getAllGames().map((g) => g.toSummary()),
      )
    }),
  )

  // End a game the requester OWNS. Ownership is verified via getManagerGame
  // (gameId + this client's clientId) — NEVER getGameById — so a manager can
  // never kill a foreign game. Reuses the wave-1 teardown helper pattern
  // (notifyManagerGone → registry.removeGame). A foreign / unknown gameId is a
  // silent no-op.
  socket.on(
    EVENTS.MANAGER.END_GAME,
    manager.withAuth(socket, (payload: EndGamePayload) => {
      const clientId = getClientId(socket)
      const game = registry.getManagerGame(payload?.gameId, clientId)

      if (!game) {
        return
      }

      game.notifyManagerGone()
      registry.removeGame(game.gameId)
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
      // WP-17 — widened: optional moderator reason + optional category override.
      const schema = z.object({
        id: z.string(),
        reason: z.string().max(500).optional(),
        category: z.enum(SUBMISSION_CATEGORIES).optional(),
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
        // Only set fields that are present so an absent reason/category never
        // overwrites an existing value with undefined.
        const update: Partial<Submission> = { status: "rejected" }

        if (result.data.reason !== undefined) {
          update.rejectionReason = result.data.reason
        }

        if (result.data.category !== undefined) {
          update.category = result.data.category
        }

        updateSubmission(result.data.id, update)
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
