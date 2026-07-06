// GROUP 1 — AUTHORING: AI text generation (active provider from ai-settings.json).
// These route to whatever text provider is active in config/ai-settings.json,
// using the key from config/ai-secrets.json (anthropic always needs a key;
// openai-compatible needs one unless the baseUrl is a local host). If no
// provider is active the tool returns "errors:ai.notConfigured".
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  generateDistractors,
  generateQuestion,
  generateQuiz,
} from "../ai-provider.js"
import { fail, ok } from "./shared.js"

export function registerAiTools(server: McpServer): void {
  server.registerTool(
    "generate_question",
    {
      title: "AI-generate a single question",
      description:
        "Generate ONE validated question about a topic via the active AI text provider. Returns a question object you can pass to create_quiz / add_question / add_to_catalog. Requires an active text provider in config/ai-settings.json.",
      inputSchema: {
        topic: z.string().min(1).max(200).describe("What the question is about."),
        type: z
          .enum(["choice", "boolean", "multiple-select", "type-answer"])
          .optional()
          .describe("Question kind to author (default choice)."),
        language: z
          .string()
          .min(2)
          .max(8)
          .optional()
          .describe("BCP-47-ish language code (default de)."),
      },
    },
    async ({ topic, type, language }: { topic: string; type?: "choice" | "boolean" | "multiple-select" | "type-answer"; language?: string }) => {
      try {
        return ok(await generateQuestion(topic, type, language))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "generate_quiz",
    {
      title: "AI-generate a full quiz",
      description:
        "Generate a full validated quiz (subject + N multiple-choice questions) about a topic via the active AI text provider. Returns the quiz object — pass it to create_quiz to persist. Requires an active text provider.",
      inputSchema: {
        topic: z.string().min(1).max(200).describe("Quiz topic."),
        count: z
          .number()
          .int()
          .min(1)
          .max(15)
          .describe("Number of questions (1-15)."),
        language: z
          .string()
          .min(2)
          .max(8)
          .optional()
          .describe("Language code (default de)."),
      },
    },
    async ({ topic, count, language }: { topic: string; count: number; language?: string }) => {
      try {
        return ok(await generateQuiz(topic, count, language))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "generate_distractors",
    {
      title: "AI-generate distractor answers",
      description:
        "Generate up to 3 plausible WRONG answers (distractors) for a question + its correct answer, via the active AI text provider. Use these to fill out a choice question's answer options. Requires an active text provider.",
      inputSchema: {
        question: z.string().min(1).max(300).describe("The question text."),
        correct: z.string().min(1).max(200).describe("The correct answer."),
        count: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe("How many distractors (1-3, default 3)."),
        language: z
          .string()
          .min(2)
          .max(8)
          .optional()
          .describe("Language code (default de)."),
      },
    },
    async ({ question, correct, count, language }: { question: string; correct: string; count?: number; language?: string }) => {
      try {
        return ok({
          distractors: await generateDistractors(
            question,
            correct,
            count,
            language,
          ),
        })
      } catch (e) {
        return fail(e)
      }
    },
  )
}
