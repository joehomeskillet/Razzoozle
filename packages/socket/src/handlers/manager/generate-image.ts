import { EVENTS, PROMPT_MAX_LEN } from "@razzoozle/common/constants"
import {
  getClientId,
  SECRET_PATTERNS,
  tryConsumeImageGenCredit,
} from "@razzoozle/socket/handlers/imageGenThrottle"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { enhancePrompt } from "@razzoozle/socket/services/ai-provider"
import { generateImage } from "@razzoozle/socket/services/comfyui"
import { checkGlobalSubmissionRate } from "@razzoozle/socket/services/submissionRateLimit"
import { z } from "zod"

export const registerGenerateImageHandler = ({ socket }: SocketContext) => {
  // ── Public AI image generation (NO auth) ──────────────────────────────────
  // Hard-throttled GPU op: 1 / 30 s AND max 5 per socket lifetime. Prompt is
  // validated (string, 1..300) and secret-scanned before reaching ComfyUI.
  socket.on(EVENTS.MANAGER.GENERATE_IMAGE, (payload: unknown) => {
    void (async () => {
      const parsed = z
        .object({ prompt: z.string().min(1).max(PROMPT_MAX_LEN) })
        .safeParse(payload)

      if (!parsed.success) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.promptInvalid",
        )

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

      // Coarse server-wide ceiling FIRST: prevent global DoS from unbounded
      // image-gen requests across all clients. No per-user side effect.
      if (!checkGlobalSubmissionRate()) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.rateLimited",
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
          error instanceof Error
            ? error.message
            : "errors:submission.imageGenFailed",
        )
      }
    })()
  })
}
