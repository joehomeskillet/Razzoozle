// #23 WP-3 — public img2img edit (NO auth, venue /submit). The client sends only
// a same-origin RELATIVE `/media/...` baseUrl + a prompt; the server resolves the
// base to bytes via a DISK read (anti-SSRF — never a network fetch of an
// attacker-controlled URL), runs the Z-Image Omni reference-conditioning workflow
// and returns the new image as IMAGE_GENERATED {url} (errors → IMAGE_ERROR).
//
// Throttle: shares the EXACT GENERATE_IMAGE GPU stack via tryConsumeImageGenCredit
// against the SAME imageGenStore (see handlers/imageGenThrottle.ts) — so a client
// can't get 5 text2img + 5 img2img + 10+10 hourly by using different event names.
import { EVENTS } from "@razzia/common/constants"
import { editImageValidator } from "@razzia/common/validators/media"
import {
  getClientId,
  SECRET_PATTERNS,
  tryConsumeImageGenCredit,
} from "@razzia/socket/handlers/imageGenThrottle"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { enhancePrompt } from "@razzia/socket/services/ai-provider"
import { generateImageFromBase } from "@razzia/socket/services/comfyui"
import { assertSafeId } from "@razzia/socket/services/config"
import fs from "fs"
import { relative, resolve } from "path"

// Resolve the config/media root exactly as services/config.ts#getPath does, so
// the bytes we read are the SAME files nginx serves from /media/. config.ts's
// mediaFilePath/assertSafeFilename are module-private; this replicates their
// path-traversal stack (per-segment assertSafeId on the stem + a relative()
// containment check) using the exported assertSafeId primitive.
const MEDIA_ROOT = "media"

const mediaRootPath = (): string => {
  const inContainerPath = process.env.CONFIG_PATH

  return inContainerPath
    ? resolve(inContainerPath, MEDIA_ROOT)
    : resolve(process.cwd(), "../../config", MEDIA_ROOT)
}

// Validate every path segment (mirrors config.ts#assertSafeFilename): reject
// leading-slash / backslash / ./ / ../ and run the stem through assertSafeId so a
// crafted filename can never escape the media root.
const assertSafeSegment = (segment: string): void => {
  if (!segment || segment === "." || segment === "..") {
    throw new Error("errors:media.invalidUrl")
  }

  const stem = segment.replace(/\.[a-z0-9]+$/iu, "")
  assertSafeId(stem)
}

// Read the bytes for a same-origin `/media/<category>/<file>` URL from disk.
// editImageValidator already guarantees the `/media/` prefix; here we split the
// remainder into <category>/<file>, validate both, and read with a final
// relative()-containment guard identical to config.ts#mediaFilePath.
const readMediaBytes = (baseUrl: string): Buffer => {
  const rest = baseUrl.slice("/media/".length)
  const segments = rest.split("/")

  // We expect exactly <category>/<file>. Reject anything deeper/shallower so an
  // unexpected nested path can't be probed.
  if (segments.length !== 2) {
    throw new Error("errors:media.invalidUrl")
  }

  const [category, file] = segments

  try {
    assertSafeId(category)
    assertSafeSegment(file)
  } catch {
    throw new Error("errors:media.invalidUrl")
  }

  const root = mediaRootPath()
  const target = resolve(root, category, file)
  const rel = relative(root, target)

  if (rel.startsWith("..") || rel === "" || resolve(root, rel) !== target) {
    throw new Error("errors:media.invalidUrl")
  }

  if (!fs.existsSync(target)) {
    throw new Error("errors:media.invalidUrl")
  }

  return fs.readFileSync(target)
}

export const registerEditHandlers = ({ socket }: SocketContext): void => {
  socket.on(EVENTS.MANAGER.EDIT_IMAGE, (payload: unknown) => {
    void (async () => {
      const parsed = editImageValidator.safeParse(payload)

      if (!parsed.success) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.promptInvalid",
        )

        return
      }

      const { baseUrl, prompt } = parsed.data

      if (SECRET_PATTERNS.some((re) => re.test(prompt))) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          "errors:submission.promptRejected",
        )

        return
      }

      // GPU throttle — SHARED store with GENERATE_IMAGE (cooldown + per-client
      // lifetime + durable hourly), consumed on the dispatch path. Keyed by the
      // DURABLE clientId (not socket.id) so a reconnect doesn't reset limits.
      const credit = tryConsumeImageGenCredit(getClientId(socket))

      if (!credit.ok) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          credit.errorKey ?? "errors:submission.imageLimitReached",
        )

        return
      }

      // Resolve the base image to bytes via a DISK read (anti-SSRF: no network
      // fetch of the client-supplied URL). A bad/missing path is a client error.
      let baseBytes: Buffer

      try {
        baseBytes = readMediaBytes(baseUrl)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          error instanceof Error ? error.message : "errors:media.invalidUrl",
        )

        return
      }

      // Server-internal prompt-enhance (#23 §1.2): rewrite the edit instruction
      // into an optimized Z-Image prompt BEFORE generation. Enhancement must
      // NEVER block the edit — on ANY failure (provider Off, timeout, missing
      // model, secret output) fall back to the raw prompt. Re-secret-scan the
      // enhanced string (a model could echo a key-shaped token).
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
        // WP-10 — img2img DELIBERATELY ignores the configured image resolution:
        // forcing a square latent on generateImageFromBase distorts/discards the
        // base aspect (Z-Image Omni conditions on reference_latents). Resolution
        // applies to txt2img (generateImage) only.
        const url = await generateImageFromBase(baseBytes, finalPrompt)
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
