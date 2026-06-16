import { AI, EVENTS } from "@razzia/common/constants"
import {
  aiGenerateDistractorsValidator,
  aiGenerateQuestionValidator,
  aiGenerateQuizValidator,
  aiSetKeyValidator,
  aiSettingsValidator,
  aiTestValidator,
} from "@razzia/common/validators/ai"
import { getClientId } from "@razzia/socket/handlers/imageGenThrottle"
import type { SocketContext } from "@razzia/socket/handlers/types"
import {
  generateDistractors,
  generateQuestion,
  generateQuiz,
  generateText,
} from "@razzia/socket/services/ai-provider"
import { setKey } from "@razzia/socket/services/ai-secrets"
import {
  getAISettings,
  setAISettings,
  toPublicAISettings,
} from "@razzia/socket/services/config"
import manager from "@razzia/socket/services/manager"

// Text-generation throttle. Text gen can spend money via a cloud key (handlers
// are auth-gated, but a logged-in manager could still hammer it), so every
// generation event shares one cooldown + lifetime cap. Keyed by the DURABLE
// clientId (services/manager.ts#getClientId), NOT socket.id, so a client cannot
// reset its cooldown / lifetime cap by reconnecting. Entries self-expire via a
// lazy time-window sweep on every read/write (no disconnect cleanup), so the
// Map cannot grow unbounded across many distinct clients.
interface TextGenState {
  last: number
  total: number
}

const textGenStore = new Map<string, TextGenState>()

// Lazy GC: drop entries whose last activity is older than this window so the
// Map cannot leak across many distinct clients. Far longer than the cooldown so
// the lifetime cap stays durable for an active client.
const TEXT_GEN_GC_MS = 3_600_000

const sweepTextGenStore = (now: number): void => {
  for (const [key, state] of textGenStore) {
    if (now - state.last > TEXT_GEN_GC_MS) {
      textGenStore.delete(key)
    }
  }
}

// Returns true if the call is allowed (and records it); false if throttled.
const allowTextGen = (clientId: string): boolean => {
  const now = Date.now()
  sweepTextGenStore(now)
  const state = textGenStore.get(clientId)

  if (state) {
    if (now - state.last < AI.TEXT_GEN_COOLDOWN_MS) {
      return false
    }

    if (state.total >= AI.TEXT_GEN_MAX_PER_SOCKET) {
      return false
    }

    state.last = now
    state.total += 1

    return true
  }

  textGenStore.set(clientId, { last: now, total: 1 })

  return true
}

const errMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

export const aiSocketHandlers = ({ socket }: SocketContext) => {
  // Read current settings (public shape — never carries a key).
  socket.on(
    EVENTS.AI.GET_SETTINGS,
    manager.withAuth(socket, () => {
      socket.emit(EVENTS.AI.SETTINGS, toPublicAISettings(getAISettings()))
    }),
  )

  socket.on(
    EVENTS.AI.SET_SETTINGS,
    manager.withAuth(socket, (payload: unknown) => {
      const result = aiSettingsValidator.safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.AI.ERROR, result.error.issues[0].message)

        return
      }

      try {
        setAISettings(result.data)
        socket.emit(EVENTS.AI.SET_SETTINGS_SUCCESS)
        socket.emit(EVENTS.AI.SETTINGS, toPublicAISettings(getAISettings()))
      } catch (error) {
        socket.emit(EVENTS.AI.ERROR, errMessage(error, "errors:ai.saveFailed"))
      }
    }),
  )

  socket.on(
    EVENTS.AI.SET_KEY,
    manager.withAuth(socket, (payload: unknown) => {
      const result = aiSetKeyValidator.safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.AI.ERROR, result.error.issues[0].message)

        return
      }

      try {
        // Empty/whitespace key clears the stored secret (setKey handles it).
        setKey(result.data.providerId, result.data.key.trim() || null)
        // Re-emit public settings so the client's keyConfigured flag updates.
        socket.emit(EVENTS.AI.SETTINGS, toPublicAISettings(getAISettings()))
      } catch (error) {
        socket.emit(EVENTS.AI.ERROR, errMessage(error, "errors:ai.saveFailed"))
      }
    }),
  )

  socket.on(
    EVENTS.AI.TEST_PROVIDER,
    manager.withAuth(socket, (payload: unknown) => {
      void (async () => {
        if (!allowTextGen(getClientId(socket))) {
          socket.emit(EVENTS.AI.TEST_RESULT, {
            ok: false,
            message: "errors:ai.rateLimited",
          })

          return
        }

        const result = aiTestValidator.safeParse(payload)

        if (!result.success) {
          socket.emit(EVENTS.AI.TEST_RESULT, {
            ok: false,
            message: result.error.issues[0].message,
          })

          return
        }

        try {
          // Minimal connectivity probe against the active provider.
          await generateText({ prompt: "ping", maxTokens: 5 })
          socket.emit(EVENTS.AI.TEST_RESULT, {
            ok: true,
            message: "manager:ai.testOk",
          })
        } catch (error) {
          socket.emit(EVENTS.AI.TEST_RESULT, {
            ok: false,
            message: errMessage(error, "errors:ai.providerError"),
          })
        }
      })()
    }),
  )

  socket.on(
    EVENTS.AI.GENERATE_QUESTION,
    manager.withAuth(socket, (payload: unknown) => {
      void (async () => {
        if (!allowTextGen(getClientId(socket))) {
          socket.emit(EVENTS.AI.ERROR, "errors:ai.rateLimited")

          return
        }

        const result = aiGenerateQuestionValidator.safeParse(payload)

        if (!result.success) {
          socket.emit(EVENTS.AI.ERROR, result.error.issues[0].message)

          return
        }

        try {
          const question = await generateQuestion(
            result.data.topic,
            result.data.type ?? "choice",
            result.data.language ?? "de",
          )
          socket.emit(EVENTS.AI.QUESTION_GENERATED, { question })
        } catch (error) {
          socket.emit(
            EVENTS.AI.ERROR,
            errMessage(error, "errors:ai.invalidOutput"),
          )
        }
      })()
    }),
  )

  socket.on(
    EVENTS.AI.GENERATE_DISTRACTORS,
    manager.withAuth(socket, (payload: unknown) => {
      void (async () => {
        if (!allowTextGen(getClientId(socket))) {
          socket.emit(EVENTS.AI.ERROR, "errors:ai.rateLimited")

          return
        }

        const result = aiGenerateDistractorsValidator.safeParse(payload)

        if (!result.success) {
          socket.emit(EVENTS.AI.ERROR, result.error.issues[0].message)

          return
        }

        try {
          const distractors = await generateDistractors(
            result.data.question,
            result.data.correct,
            result.data.count ?? 3,
            result.data.language ?? "de",
          )
          socket.emit(EVENTS.AI.DISTRACTORS_GENERATED, { distractors })
        } catch (error) {
          socket.emit(
            EVENTS.AI.ERROR,
            errMessage(error, "errors:ai.invalidOutput"),
          )
        }
      })()
    }),
  )

  socket.on(
    EVENTS.AI.GENERATE_QUIZ,
    manager.withAuth(socket, (payload: unknown) => {
      void (async () => {
        if (!allowTextGen(getClientId(socket))) {
          socket.emit(EVENTS.AI.ERROR, "errors:ai.rateLimited")

          return
        }

        const result = aiGenerateQuizValidator.safeParse(payload)

        if (!result.success) {
          socket.emit(EVENTS.AI.ERROR, result.error.issues[0].message)

          return
        }

        try {
          // Do NOT persist — the web client saves via QUIZZ.SAVE.
          const quizz = await generateQuiz(
            result.data.topic,
            result.data.count,
            result.data.language ?? "de",
          )
          socket.emit(EVENTS.AI.QUIZ_GENERATED, { quizz })
        } catch (error) {
          socket.emit(
            EVENTS.AI.ERROR,
            errMessage(error, "errors:ai.invalidOutput"),
          )
        }
      })()
    }),
  )
}
