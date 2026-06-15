// Public prompt-enhance preview for the /submit media pipeline (#23 WP-1).
//
// Standalone, OPTIONAL preview event: the client sends a rough image idea and
// the server returns an LLM-rewritten, Z-Image-optimized prompt so the UI can
// show an A/B (raw vs enhanced) reveal before the GPU GENERATE_IMAGE call. This
// is purely a UI affordance — the SAME enhancement also runs unconditionally
// server-internal inside GENERATE_IMAGE (handlers/manager.ts), so this event is
// never required for correct generation.
//
// This is an LLM op, NOT a GPU op — no ComfyUI call. It rides a lightweight
// guard so it can't be spammed as a free LLM vector:
//   1. checkGlobalSubmissionRate()  — coarse server-wide ceiling FIRST (no
//      per-user side effect), so tripping it never burns a legit user's budget.
//   2. checkRateLimit(getClientId)  — per-client 3/60s (shares the submission
//      budget; an LLM call is cheap and the GPU path is the real cost).
//   3. enhancePromptValidator       — string 1..PROMPT_MAX_LEN.
//   4. SECRET_PATTERNS scan         — reject key-shaped input.
//
// Graceful skip (MANDATORY, #23 §1.2): enhancement must NEVER error the path. On
// ANY enhancePrompt throw (provider Off, timeout, missing model, secret-output
// rejection) we emit PROMPT_ENHANCED with the RAW prompt so the UI always gets a
// usable value. The enhanced string is re-secret-scanned (a model could echo a
// key-shaped token) and falls back to raw if it matches.
import { EVENTS } from "@razzoozle/common/constants"
import { enhancePromptValidator } from "@razzoozle/common/validators/media"
import {
  getClientId,
  SECRET_PATTERNS,
} from "@razzoozle/socket/handlers/imageGenThrottle"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { enhancePrompt } from "@razzoozle/socket/services/ai-provider"
import {
  checkGlobalSubmissionRate,
  checkRateLimit,
} from "@razzoozle/socket/services/submissionRateLimit"

export const registerEnhanceHandlers = ({ socket }: SocketContext): void => {
  socket.on(EVENTS.MANAGER.ENHANCE_PROMPT, (payload: unknown) => {
    void (async () => {
      // Coarse server-wide ceiling FIRST (no per-user side effect), so tripping
      // it never burns a legit user's personal 3/60s budget.
      if (!checkGlobalSubmissionRate()) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.rateLimited",
        )

        return
      }

      // Per-client throttle keyed by the DURABLE clientId so a reconnect does
      // NOT reset the quota (socket.id changes on every reconnect → bypass).
      if (!checkRateLimit(getClientId(socket))) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.rateLimited",
        )

        return
      }

      const parsed = enhancePromptValidator.safeParse(payload)

      if (!parsed.success) {
        socket.emit(EVENTS.MANAGER.IMAGE_ERROR, parsed.error.issues[0].message)

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

      // Graceful skip: enhancement must NEVER error the path. On ANY failure
      // fall back to the raw prompt so the UI always gets a usable value. The
      // enhanced string is re-secret-scanned (a model could echo a key-shaped
      // token); fall back to raw if it matches.
      let result = prompt
      try {
        const enhanced = await enhancePrompt(prompt)

        if (!SECRET_PATTERNS.some((re) => re.test(enhanced))) {
          result = enhanced
        }
      } catch {
        result = prompt
      }

      socket.emit(EVENTS.MANAGER.PROMPT_ENHANCED, { prompt: result })
    })()
  })
}
