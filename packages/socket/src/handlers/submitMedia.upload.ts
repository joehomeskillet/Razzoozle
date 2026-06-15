// #23 WP-2 — public, throttled, byte-capped image upload for the /submit page.
//
// This is the PUBLIC counterpart to the auth-gated MEDIA.UPLOAD: it does NOT
// reuse the MEDIA.* namespace (de-authing MEDIA.UPLOAD would adjacently expose
// MEDIA.LIST/DELETE — the whole manager library). Instead it listens on the
// dedicated SUBMIT_UPLOAD_IMAGE event with an image-only validator (no audio, no
// category) and emits the dedicated UPLOAD_IMAGE_SUCCESS {url} on success.
//
// Guard order (spec §1.3 WP-2):
//   1. checkGlobalSubmissionRate()  — coarse server-wide ceiling, no per-user
//      side effect (so tripping it never burns a legit user's personal budget).
//   2. checkRateLimit(getClientId)  — per-client 3/60s, keyed by the DURABLE
//      clientId (NOT socket.id) so a reconnect cannot reset the quota. Shares
//      the same submission budget as questions (intended for venue submit).
//   3. publicUploadValidator        — image-only data URL, filename ≤200.
//   4. NEW byte cap                 — decode the base64 payload and reject
//      anything over MEDIA_UPLOAD_MAX_BYTES BEFORE saveMediaFile (this closes
//      the #21 gap: saveMediaFile / mediaUploadValidator enforce NO size).
//   5. saveMediaFile(..., "questions") — the deep MIME allowlist
//      (png|jpeg|webp), the server-generated stored name (normalizeMediaStem +
//      nanoid + .webp) and the assertSafeId/assertSafeFilename/mediaFilePath
//      path-traversal stack all already fire inside it. The client filename is
//      NEVER used as the on-disk path.
//
// Errors emit EVENTS.MANAGER.IMAGE_ERROR with a string i18n key (mirrors
// GENERATE_IMAGE / SUBMIT_QUESTION).
import { EVENTS, MEDIA_UPLOAD_MAX_BYTES } from "@razzoozle/common/constants"
import { publicUploadValidator } from "@razzoozle/common/validators/media"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { getClientId } from "@razzoozle/socket/handlers/imageGenThrottle"
import { saveMediaFile } from "@razzoozle/socket/services/config"
import {
  checkGlobalSubmissionRate,
  checkRateLimit,
} from "@razzoozle/socket/services/submissionRateLimit"

// Decode only the base64 portion of an image data URL to measure the real
// payload size. Mirrors saveMediaFile's internal DATA_URL_RE (`data:<mime>;
// base64,<payload>`) so the byte cap is checked against the SAME bytes that
// would be written. Returns null when the shape is unexpected (the validator
// already guarantees the `data:image/` prefix; saveMediaFile re-validates the
// MIME, so a null here just means "let saveMediaFile reject it cleanly").
const decodedByteLength = (dataUrl: string): number | null => {
  const comma = dataUrl.indexOf(",")

  if (comma === -1 || !/;base64$/u.test(dataUrl.slice(0, comma))) {
    return null
  }

  return Buffer.from(dataUrl.slice(comma + 1), "base64").byteLength
}

export const registerUploadHandlers = ({ socket }: SocketContext): void => {
  socket.on(EVENTS.MANAGER.SUBMIT_UPLOAD_IMAGE, (payload: unknown) => {
    void (async () => {
      // 1. Coarse server-wide ceiling FIRST (no per-user side effect).
      if (!checkGlobalSubmissionRate()) {
        socket.emit(EVENTS.MANAGER.IMAGE_ERROR, "errors:submission.rateLimited")

        return
      }

      // 2. Per-client throttle keyed by the DURABLE clientId.
      if (!checkRateLimit(getClientId(socket))) {
        socket.emit(EVENTS.MANAGER.IMAGE_ERROR, "errors:submission.rateLimited")

        return
      }

      // 3. Image-only data URL + filename validation.
      const parsed = publicUploadValidator.safeParse(payload)

      if (!parsed.success) {
        socket.emit(EVENTS.MANAGER.IMAGE_ERROR, parsed.error.issues[0].message)

        return
      }

      const { filename, dataUrl } = parsed.data

      // 4. NEW byte cap — decode the base64 payload and reject oversize BEFORE
      // saveMediaFile (the #21 gap). Closing this here prevents an attacker from
      // forcing an expensive WebP transcode of a multi-MB buffer.
      const byteLength = decodedByteLength(dataUrl)

      if (byteLength !== null && byteLength > MEDIA_UPLOAD_MAX_BYTES) {
        socket.emit(EVENTS.MANAGER.IMAGE_ERROR, "errors:media.tooLarge")

        return
      }

      // 5. Persist via the shared media pipeline: deep MIME allowlist +
      // server-generated stored name + path-traversal stack all fire inside
      // saveMediaFile. The client filename never becomes the on-disk path.
      try {
        const meta = await saveMediaFile(dataUrl, filename, "questions")
        socket.emit(EVENTS.MANAGER.UPLOAD_IMAGE_SUCCESS, { url: meta.url })
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.IMAGE_ERROR,
          error instanceof Error
            ? error.message
            : "errors:media.invalidDataUrl",
        )
      }
    })()
  })
}
