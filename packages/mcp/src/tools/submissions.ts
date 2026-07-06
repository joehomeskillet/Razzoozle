// GROUP 1 — AUTHORING: moderation queue (feature #5 submissions).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { SUBMISSION_CATEGORIES } from "@razzoozle/common/constants"
import { z } from "zod"
import {
  approveSubmission,
  getSubmissionById,
  getSubmissions,
  getSubmissionsMeta,
  rejectSubmission,
} from "../config-store.js"
import { fail, ok } from "./shared.js"

export function registerSubmissionTools(server: McpServer): void {
  server.registerTool(
    "list_submissions",
    {
      title: "List question submissions",
      description:
        "List the public question-submission queue (id, submittedBy, status, question text). Pass full=true for complete records.",
      inputSchema: {
        full: z
          .boolean()
          .optional()
          .describe("Return full submission records instead of meta."),
      },
    },
    ({ full }: { full?: boolean }) => {
      try {
        return ok(full ? getSubmissions() : getSubmissionsMeta())
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "get_submission",
    {
      title: "Get a submission",
      description: "Get one full submission record by id.",
      inputSchema: { id: z.string().describe("Submission id.") },
    },
    ({ id }: { id: string }) => {
      try {
        const s = getSubmissionById(id)
        return s ? ok(s) : fail(new Error(`Submission "${id}" not found`))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "approve_submission",
    {
      title: "Approve a submission",
      description:
        "Approve a pending submission: append its question to an existing quiz and mark it approved (same effect as the in-app moderation action).",
      inputSchema: {
        id: z.string().describe("Submission id."),
        quizId: z.string().describe("Quiz id to append the question to."),
      },
    },
    ({ id, quizId }: { id: string; quizId: string }) => {
      try {
        approveSubmission(id, quizId)
        return ok({ approved: id, addedTo: quizId })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "reject_submission",
    {
      title: "Reject a submission",
      description:
        "Mark a pending submission as rejected, optionally with a moderator reason and a category override.",
      inputSchema: {
        id: z.string().describe("Submission id."),
        // WP-17 — optional moderator note + optional category override, mirroring
        // the socket REJECT_SUBMISSION payload.
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Optional moderator note for why it was rejected."),
        category: z
          .enum(SUBMISSION_CATEGORIES)
          .optional()
          .describe("Optional topic category override."),
      },
    },
    ({ id, reason, category }: { id: string; reason?: string; category?: "general" | "history" | "science" | "geography" | "sports" | "entertainment" | "technology" | "other" }) => {
      try {
        rejectSubmission(id, reason, category)
        return ok({ rejected: id })
      } catch (e) {
        return fail(e)
      }
    },
  )
}
