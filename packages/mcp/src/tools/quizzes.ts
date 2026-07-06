// GROUP 1 — AUTHORING: quiz + question authoring (file-backed, validated).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  deleteQuizz,
  getConfigDir,
  getQuizzById,
  getQuizzMeta,
  saveQuizz,
  setQuizzArchived,
  updateQuizz,
} from "../config-store.js"
import { generateImage } from "../comfyui.js"
import { buildQuestion } from "../question-builder.js"
import { fail, ok, questionInputShape, toBuildInput } from "./shared.js"

export function registerQuizTools(server: McpServer): void {
  server.registerTool(
    "list_quizzes",
    {
      title: "List quizzes",
      description:
        "List all quizzes in the config volume (id + subject). The id is what start_game takes.",
      inputSchema: {},
    },
    () => {
      try {
        return ok({ configDir: getConfigDir(), quizzes: getQuizzMeta() })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "get_quiz",
    {
      title: "Get quiz",
      description: "Get the full quiz (subject + questions) by id.",
      inputSchema: { id: z.string().describe("Quiz id (from list_quizzes).") },
    },
    ({ id }: { id: string }) => {
      try {
        return ok(getQuizzById(id))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "create_quiz",
    {
      title: "Create quiz",
      description:
        "Create a NEW quiz. Validates the whole quiz with quizzValidator before writing config/quizz/<id>.json. Returns the generated id. Each question must be a valid Question object (use create_question to build them, or pass raw objects).",
      inputSchema: {
        subject: z.string().min(1).describe("Quiz title/subject."),
        questions: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .describe("Array of question objects (>=1)."),
      },
    },
    ({ subject, questions }: { subject: string; questions: Array<Record<string, unknown>> }) => {
      try {
        const { id } = saveQuizz({ subject, questions })
        return ok({ id, subject, questionCount: questions.length })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "delete_quiz",
    {
      title: "Delete quiz",
      description: "Delete a quiz file by id.",
      inputSchema: { id: z.string().describe("Quiz id to delete.") },
    },
    ({ id }: { id: string }) => {
      try {
        deleteQuizz(id)
        return ok({ deleted: id })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "create_question",
    {
      title: "Build a question",
      description:
        "Build and validate a single Question for any type with sensible defaults (cooldown 5, time 20). Returns the validated question object you can pass to create_quiz / add_question. Does NOT write anything.",
      inputSchema: questionInputShape,
    },
    (args: Record<string, unknown>) => {
      try {
        return ok(buildQuestion(toBuildInput(args)))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "add_question",
    {
      title: "Add question to quiz",
      description:
        "Build a question (same fields as create_question) and append it to an existing quiz. Re-validates the whole quiz before writing.",
      inputSchema: {
        quizId: z.string().describe("Target quiz id."),
        ...questionInputShape,
      },
    },
    (args: { quizId: string; [key: string]: unknown }) => {
      try {
        const { quizId, ...rest } = args
        const quizz = getQuizzById(quizId)
        const question = buildQuestion(toBuildInput(rest))
        updateQuizz(quizId, {
          subject: quizz.subject,
          questions: [...quizz.questions, question],
        })
        return ok({
          quizId,
          added: question.question,
          questionCount: quizz.questions.length + 1,
        })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "update_question",
    {
      title: "Update a question in a quiz",
      description:
        "Replace the question at `index` (0-based) in a quiz with a freshly built one (same fields as create_question). Re-validates the whole quiz before writing.",
      inputSchema: {
        quizId: z.string().describe("Target quiz id."),
        index: z
          .number()
          .int()
          .min(0)
          .describe("0-based question index to replace."),
        ...questionInputShape,
      },
    },
    (args: { quizId: string; index: number; [key: string]: unknown }) => {
      try {
        const { quizId, index, ...rest } = args
        const quizz = getQuizzById(quizId)
        if (index >= quizz.questions.length) {
          return fail(
            new Error(
              `index ${index} out of range (quiz has ${quizz.questions.length} questions)`,
            ),
          )
        }
        const question = buildQuestion(toBuildInput(rest))
        const questions = [...quizz.questions]
        questions[index] = question
        updateQuizz(quizId, { subject: quizz.subject, questions })
        return ok({ quizId, updatedIndex: index, question: question.question })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "delete_question",
    {
      title: "Delete a question from a quiz",
      description:
        "Remove the question at `index` (0-based) from a quiz. Re-validates before writing (a quiz must keep >=1 question).",
      inputSchema: {
        quizId: z.string().describe("Target quiz id."),
        index: z
          .number()
          .int()
          .min(0)
          .describe("0-based question index to remove."),
      },
    },
    ({ quizId, index }: { quizId: string; index: number }) => {
      try {
        const quizz = getQuizzById(quizId)
        if (index >= quizz.questions.length) {
          return fail(
            new Error(
              `index ${index} out of range (quiz has ${quizz.questions.length} questions)`,
            ),
          )
        }
        const questions = quizz.questions.filter((_, i) => i !== index)
        updateQuizz(quizId, { subject: quizz.subject, questions })
        return ok({
          quizId,
          removedIndex: index,
          questionCount: questions.length,
        })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "generate_question_image",
    {
      title: "Generate an AI image for a question",
      description:
        "Generate an image from a prompt via the local ComfyUI (Z-Image Turbo), transcode to WebP, save into config/media, and return its public /media/<file>.webp URL. Pass that URL as `mediaUrl` to create_question/add_question. This can take 30-180s on a cold model load.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .max(300)
          .describe("Image description (1-300 chars). No secrets."),
      },
    },
    async ({ prompt }: { prompt: string }) => {
      try {
        const url = await generateImage(prompt)
        return ok({ url, hint: "Pass this as `mediaUrl` to a question." })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "archive_quiz",
    {
      title: "Archive / unarchive a quiz",
      description:
        "Flip a quiz's archived flag without deleting it. Archived quizzes are hidden from the host picker but kept on disk. Pass archived=false to restore.",
      inputSchema: {
        id: z.string().describe("Quiz id (from list_quizzes)."),
        archived: z
          .boolean()
          .optional()
          .describe("True to archive (default), false to restore."),
      },
    },
    ({ id, archived }: { id: string; archived?: boolean }) => {
      try {
        const next = archived ?? true
        setQuizzArchived(id, next)
        return ok({ id, archived: next })
      } catch (e) {
        return fail(e)
      }
    },
  )
}
