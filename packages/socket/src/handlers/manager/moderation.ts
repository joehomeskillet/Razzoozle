import { EVENTS, SUBMISSION_CATEGORIES } from "@razzoozle/common/constants"
import type { Question } from "@razzoozle/common/types/game"
import type { Submission } from "@razzoozle/common/types/submission"
import { questionValidator } from "@razzoozle/common/validators/quizz"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  assertSafeId,
  saveCatalogEntry,
  updateQuizz,
  updateSubmission,
} from "@razzoozle/socket/services/config"
import {
  readQuizzById,
  readSubmissionById,
  readSubmissions,
} from "@razzoozle/socket/services/storage/config-read"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"
import { z } from "zod"

export const registerModerationHandlers = ({ socket }: SocketContext) => {
  // ── Admin (auth-gated) submission moderation ──────────────────────────────
  socket.on(
    EVENTS.MANAGER.LIST_SUBMISSIONS,
    manager.withAuth(socket, async () => {
      socket.emit(EVENTS.MANAGER.SUBMISSIONS_DATA, await readSubmissions())
    }),
  )

  socket.on(
    EVENTS.MANAGER.EDIT_SUBMISSION,
    manager.withAuth(socket, async (payload: unknown) => {
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
        await emitConfig(socket)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          error instanceof Error
            ? error.message
            : "errors:submission.saveFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.APPROVE_SUBMISSION,
    manager.withAuth(socket, async (payload: unknown) => {
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

        const submission = await readSubmissionById(result.data.id)

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
          await emitConfig(socket)

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

        const quizz = await readQuizzById(result.data.quizzId)

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
        await emitConfig(socket)
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
    manager.withAuth(socket, async (payload: unknown) => {
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
        await emitConfig(socket)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.SUBMISSION_ERROR,
          error instanceof Error ? error.message : "errors:submission.notFound",
        )
      }
    }),
  )
}
