#!/usr/bin/env node
// Project-scoped MCP stdio server for the Rahoot/Razzia quiz app.
//
// Two tool groups:
//   1. AUTHORING — read/write quizz/result/submission/theme files in the live
//      config volume (RAHOOT_CONFIG), validated with @razzia/common validators
//      before every write, plus AI image generation via ComfyUI into config/media.
//   2. GAME CONTROL — drive a LIVE game as a manager over socket.io-client
//      (RAHOOT_SOCKET_URL, path /ws), reusing @razzia/common EVENTS. The
//      presenter/beamer (a socket client reflecting game state) stays paired to
//      whatever game start_game creates.
//
// Secrets: the manager password is read from game.json only inside the game
// controller and is NEVER echoed to a tool result, a log, or the server stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { QUESTION_TYPES, SUBMISSION_CATEGORIES } from "@razzia/common/constants"
import { z } from "zod"
import {
  approveSubmission,
  deleteCatalogEntry,
  deleteQuizz,
  getAllQuizzes,
  getCatalog,
  getConfigDir,
  getQuizzById,
  getQuizzMeta,
  getResultById,
  getResultsMeta,
  getSubmissionById,
  getSubmissions,
  getSubmissionsMeta,
  getTheme,
  rejectSubmission,
  saveCatalogEntry,
  saveQuizz,
  setQuizzArchived,
  setTheme,
  updateQuizz,
} from "./config-store.js"
import {
  generateDistractors,
  generateQuestion,
  generateQuiz,
} from "./ai-provider.js"
import { generateImage } from "./comfyui.js"
import { buildQuestion, type BuildQuestionInput } from "./question-builder.js"
import { gameController } from "./game-controller.js"

const server = new McpServer({
  name: "rahoot-mcp",
  version: "1.0.0",
})

// ── result helpers ──────────────────────────────────────────────────────────

const ok = (data: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    },
  ],
})

const fail = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
  isError: true as const,
})

// ── reusable zod input pieces (zod 4, same major as @razzia/common) ──────────

// Loose question shape for create_question / add_question. The authoritative
// validation is questionValidator (run inside buildQuestion / saveQuizz); this
// just surfaces the fields to the model with helpful descriptions.
const questionInputShape = {
  type: z
    .enum(QUESTION_TYPES)
    .describe(
      "Question kind: choice (single correct), boolean (true/false), multiple-select (>=2 correct), type-answer (free text), slider (numeric guess), poll (opinion, no correct answer).",
    ),
  question: z.string().min(1).describe("The question text shown to players."),
  answers: z
    .array(z.string().min(1))
    .min(2)
    .max(4)
    .optional()
    .describe("2-4 answer options (choice/boolean/multiple-select/poll)."),
  solutions: z
    .array(z.number().int().min(0))
    .optional()
    .describe(
      "Index(es) into `answers` of the correct option(s). choice/boolean: 1 index; multiple-select: >=2 indices. Omit for poll/type-answer/slider.",
    ),
  min: z.number().optional().describe("slider: minimum value."),
  max: z.number().optional().describe("slider: maximum value."),
  correct: z.number().optional().describe("slider: the correct value."),
  step: z.number().positive().optional().describe("slider: step granularity."),
  unit: z.string().optional().describe("slider: display unit (e.g. '%','km')."),
  acceptedAnswers: z
    .array(z.string().min(1).max(200))
    .optional()
    .describe("type-answer: accepted free-text answers (1-20)."),
  matchMode: z
    .enum(["exact", "normalized", "fuzzy"])
    .optional()
    .describe("type-answer: comparison mode (default normalized)."),
  mediaUrl: z
    .string()
    .optional()
    .describe(
      "Optional image URL (e.g. a /media/...webp from generate_question_image, or any absolute URL).",
    ),
  cooldown: z
    .number()
    .int()
    .min(3)
    .max(15)
    .optional()
    .describe(
      "Seconds the question is shown before answers open (3-15, def 5).",
    ),
  time: z
    .number()
    .int()
    .min(5)
    .max(120)
    .optional()
    .describe("Seconds players have to answer (5-120, def 20)."),
  practice: z.boolean().optional().describe("Practice question (no scoring)."),
  bonus: z.boolean().optional().describe("Bonus question (double points)."),
}

const toBuildInput = (a: Record<string, unknown>): BuildQuestionInput =>
  a as unknown as BuildQuestionInput

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — AUTHORING (file-backed, validated)
// ─────────────────────────────────────────────────────────────────────────────

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
  ({ id }) => {
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
  ({ subject, questions }) => {
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
  ({ id }) => {
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
  (args) => {
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
  (args) => {
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
  (args) => {
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
  ({ quizId, index }) => {
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
  async ({ prompt }) => {
    try {
      const url = await generateImage(prompt)
      return ok({ url, hint: "Pass this as `mediaUrl` to a question." })
    } catch (e) {
      return fail(e)
    }
  },
)

// ── Results ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_results",
  {
    title: "List past game results",
    description: "List saved game results (id, subject, date, playerCount).",
    inputSchema: {},
  },
  () => {
    try {
      return ok(getResultsMeta())
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "get_result",
  {
    title: "Get a game result",
    description:
      "Get a full saved game result (players + per-question answers) by id.",
    inputSchema: { id: z.string().describe("Result id (from list_results).") },
  },
  ({ id }) => {
    try {
      return ok(getResultById(id))
    } catch (e) {
      return fail(e)
    }
  },
)

// ── Submissions (feature #5 moderation queue) ────────────────────────────────

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
  ({ full }) => {
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
  ({ id }) => {
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
  ({ id, quizId }) => {
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
  ({ id, reason, category }) => {
    try {
      rejectSubmission(id, reason, category)
      return ok({ rejected: id })
    } catch (e) {
      return fail(e)
    }
  },
)

// ── Config + theme ──────────────────────────────────────────────────────────

server.registerTool(
  "get_config",
  {
    title: "Get app config overview",
    description:
      "Non-secret overview: config dir, quiz/result/submission counts, manager-password configured flag (NEVER the password), and the active theme.",
    inputSchema: {},
  },
  () => {
    try {
      // We intentionally do NOT call getGameConfig() here (it would surface the
      // password). Whether auth is usable is reported only as a boolean by
      // attempting a connect-light check would require the socket; instead we
      // report file presence.
      return ok({
        configDir: getConfigDir(),
        quizzes: getQuizzMeta().length,
        results: getResultsMeta().length,
        submissions: getSubmissionsMeta().length,
        theme: getTheme(),
        socketUrl: process.env.RAHOOT_SOCKET_URL ?? "http://127.0.0.1:3010",
        simModeEnabled: process.env.RAHOOT_SIM_MODE === "1",
      })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "get_theme",
  {
    title: "Get theme",
    description:
      "Get the current theme (colors, radius, backgrounds, branding).",
    inputSchema: {},
  },
  () => {
    try {
      return ok(getTheme())
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "set_theme",
  {
    title: "Set theme",
    description:
      "Persist a full theme object (validated with themeValidator) to config/theme/theme.json. If a game is live and authenticated, also live-broadcasts it to every connected client. Provide the WHOLE theme (get_theme first, then modify).",
    inputSchema: {
      theme: z
        .record(z.string(), z.unknown())
        .describe("Full theme object (see get_theme for the shape)."),
      broadcast: z
        .boolean()
        .optional()
        .describe(
          "If true and a game is live, also push to connected clients via the manager socket.",
        ),
    },
  },
  ({ theme, broadcast }) => {
    try {
      const saved = setTheme(theme)
      let pushed = false
      if (broadcast && gameController.getState().authenticated) {
        gameController.setTheme(saved)
        pushed = true
      }
      return ok({ saved: true, broadcast: pushed, theme: saved })
    } catch (e) {
      return fail(e)
    }
  },
)

// ── Catalog (reusable question bank) ─────────────────────────────────────────

server.registerTool(
  "list_catalog",
  {
    title: "List catalog (question bank) entries",
    description:
      "List reusable questions saved in config/catalog (id, question text, type, tags, source, addedAt). These can be dropped into a quiz as-is.",
    inputSchema: {},
  },
  () => {
    try {
      return ok(
        getCatalog().map((e) => ({
          id: e.id,
          question: e.question.question,
          type: e.question.type,
          tags: e.tags,
          source: e.source,
          addedAt: e.addedAt,
        })),
      )
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "add_to_catalog",
  {
    title: "Add a question to the catalog",
    description:
      "Build a question (same fields as create_question) and store it in the reusable question bank (config/catalog/<id>.json). Re-validates the question before writing and returns the generated catalog entry id.",
    inputSchema: {
      ...questionInputShape,
      tags: z
        .array(z.string().min(1).max(40))
        .max(20)
        .optional()
        .describe("Optional free-text tags (<=20, each 1-40 chars)."),
      source: z
        .enum(["manual", "submission", "editor", "ai"])
        .optional()
        .describe("Provenance chip (default manual)."),
    },
  },
  (args) => {
    try {
      const { tags, source, ...rest } = args
      const question = buildQuestion(toBuildInput(rest))
      const entry = saveCatalogEntry({ question, tags, source })
      return ok({
        id: entry.id,
        question: entry.question.question,
        tags: entry.tags,
        source: entry.source,
      })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "delete_catalog_entry",
  {
    title: "Delete a catalog entry",
    description: "Delete a reusable question from the catalog by id.",
    inputSchema: {
      id: z.string().describe("Catalog entry id (from list_catalog)."),
    },
  },
  ({ id }) => {
    try {
      deleteCatalogEntry(id)
      return ok({ deleted: id })
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
  ({ id, archived }) => {
    try {
      const next = archived ?? true
      setQuizzArchived(id, next)
      return ok({ id, archived: next })
    } catch (e) {
      return fail(e)
    }
  },
)

// ── AI text generation (active text provider from config/ai-settings.json) ───
// These route to whatever text provider is active in config/ai-settings.json,
// using the key from config/ai-secrets.json (anthropic always needs a key;
// openai-compatible needs one unless the baseUrl is a local host). If no
// provider is active the tool returns "errors:ai.notConfigured".

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
  async ({ topic, type, language }) => {
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
  async ({ topic, count, language }) => {
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
  async ({ question, correct, count, language }) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — GAME CONTROL (live socket, game master)
// ─────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "start_game",
  {
    title: "Start a live game (host)",
    description:
      "Connect to the live socket as manager, authenticate (password read from game.json — never shown), create a game for `quizId`, and return the join PIN + gameId. The presenter/beamer paired to this game then reflects its state. After this, call begin_round to leave the lobby and show question 1.",
    inputSchema: {
      quizId: z.string().describe("Quiz id to host (from list_quizzes)."),
    },
  },
  async ({ quizId }) => {
    try {
      const { gameId, pin } = await gameController.startGame(quizId)
      return ok({
        gameId,
        pin,
        joinHint: `Players join with PIN ${pin}. Call begin_round to start question 1.`,
      })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "begin_round",
  {
    title: "Begin the game (start question 1)",
    description:
      "Leave the lobby and start the first round of the current game (emits START_GAME). Players must have joined first. The game then advances via next_question.",
    inputSchema: {},
  },
  () => {
    try {
      gameController.begin()
      return ok({ started: true, state: gameController.getState() })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "next_question",
  {
    title: "Advance to the next question",
    description:
      "Advance the current game to the next question (or from a leaderboard view to the next round). Emits NEXT_QUESTION.",
    inputSchema: {},
  },
  () => {
    try {
      gameController.nextQuestion()
      return ok({ advanced: true })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "show_leaderboard",
  {
    title: "Show the leaderboard",
    description:
      "Show the standings on the presenter (emits SHOW_LEADERBOARD), typically between questions.",
    inputSchema: {},
  },
  () => {
    try {
      gameController.showLeaderboard()
      return ok({ leaderboardShown: true })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "abort_game",
  {
    title: "Abort the current game",
    description:
      "Abort the running quiz (emits ABORT_QUIZ). Players get a reset.",
    inputSchema: {},
  },
  () => {
    try {
      gameController.abort()
      return ok({ aborted: true })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "add_bots",
  {
    title: "Add scripted bot players (sim mode)",
    description:
      "Add N scripted bot opponents to the current game (emits ADD_BOTS). NOTE: the SERVER REFUSES this unless it runs with RAHOOT_SIM_MODE=1; otherwise it replies 'errors:manager.simModeDisabled' (surfaced in get_game_state.lastError). Must be called in the lobby / between answer windows.",
    inputSchema: {
      count: z
        .number()
        .int()
        .min(1)
        .max(50)
        .describe("How many bots to add (1-50 per request; per-game cap 200)."),
    },
  },
  ({ count }) => {
    try {
      gameController.addBots(count)
      return ok({
        requested: count,
        note: "Refused server-side unless RAHOOT_SIM_MODE=1. Check get_game_state.lastError.",
      })
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  "get_game_state",
  {
    title: "Get live game state",
    description:
      "Current game master view: connection/auth, gameId, join PIN, started flag, current phase/status + data, current/total question, player roster + scores, and lastError (e.g. a refused action).",
    inputSchema: {},
  },
  () => {
    try {
      const s = gameController.getState()
      return ok({
        ...s,
        players: s.players.map((p) => ({
          username: p.username,
          points: p.points,
          streak: p.streak,
          connected: p.connected,
          isBot: p.isBot ?? false,
        })),
      })
    } catch (e) {
      return fail(e)
    }
  },
)

// Optional, documented-but-not-implemented future capability: browser-level
// presenter automation. The robust, REQUIRED path is the socket-level game
// master control above — the presenter/beamer is itself a socket client that
// reflects the game state this server drives. A `presenter_open`/`presenter_*`
// browser-automation tool (e.g. via Playwright pointed at /satellite/<gameId>)
// could be added later, but is intentionally NOT wired here so the server has no
// heavy browser dependency. See README "Presenter / beamer".

// ── boot ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr only (stdout is the MCP JSON-RPC channel — never write to it).
  process.stderr.write(
    `[rahoot-mcp] ready. config=${getConfigDir()} socket=${
      process.env.RAHOOT_SOCKET_URL ?? "http://127.0.0.1:3010"
    }\n`,
  )
}

main().catch((e) => {
  process.stderr.write(
    `[rahoot-mcp] fatal: ${e instanceof Error ? e.message : String(e)}\n`,
  )
  process.exit(1)
})
