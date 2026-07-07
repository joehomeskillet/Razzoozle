import {
  SOUND_SLOTS,
  THEME_SLOTS,
  type SoundSlot,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import { toWebp } from "@razzoozle/socket/services/webp"
import fs from "fs"
import { resolve } from "path"
import { ensureDir, getPath } from "@razzoozle/socket/services/config/shared"
import {
  MEDIA_AUDIO_MIME,
  MEDIA_ROOT,
  createMediaMeta,
  decodeDataUrl,
  ensureMediaDirs,
  extensionForMime,
  mediaFilePath,
  removeManifestWhere,
  upsertMediaMeta,
} from "@razzoozle/socket/services/config/media"

// Persist an uploaded background image (data URL) for a slot and return its
// public "/media/backgrounds/<file>" path (served by nginx from the config
// volume).
export const saveBackgroundImage = async (
  slot: ThemeSlot,
  dataUrl: string,
): Promise<string> => {
  if (!THEME_SLOTS.includes(slot)) {
    throw new Error("errors:theme.invalidSlot")
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl)

  if (!match) {
    throw new Error("errors:theme.invalidImage")
  }

  const buffer = Buffer.from(match[2], "base64")

  // 8 MB hard cap
  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("errors:theme.imageTooLarge")
  }

  ensureMediaDirs()
  const backgroundsDir = getPath(`${MEDIA_ROOT}/backgrounds`)

  // Remove previous files for this slot so the folder doesn't grow unbounded.
  for (const file of fs.readdirSync(backgroundsDir)) {
    if (file.startsWith(`${slot}-`)) {
      fs.unlinkSync(resolve(backgroundsDir, file))
    }
  }
  removeManifestWhere(
    (item) =>
      item.category === "backgrounds" &&
      item.source === "theme" &&
      item.filename.startsWith(`${slot}-`),
  )

  // Transcode every upload to WebP so served theme assets are WebP-only.
  const webp = await toWebp(buffer)
  const filename = `${slot}-${Date.now()}.webp`
  fs.writeFileSync(mediaFilePath("backgrounds", filename), webp)

  upsertMediaMeta(
    createMediaMeta({
      filename,
      category: "backgrounds",
      size: webp.byteLength,
      type: "image",
      source: "theme",
    }),
  )

  return `/media/backgrounds/${filename}`
}

// Persist an uploaded sound (data URL) for a SOUND_SLOT and return its public
// "/media/sounds/<file>" path (served by nginx from the config volume). Unlike
// saveBackgroundImage (which transcodes to WebP), audio bytes are written AS-IS
// — only the container extension is derived from the MIME (mp3/wav/ogg).
export const saveSoundFile = async (
  slot: SoundSlot,
  dataUrl: string,
): Promise<string> => {
  if (!SOUND_SLOTS.includes(slot)) {
    throw new Error("errors:theme.invalidSlot")
  }

  const { mime, buffer } = decodeDataUrl(
    dataUrl,
    MEDIA_AUDIO_MIME,
    "errors:theme.invalidAudio",
  )

  // 4 MB hard cap
  if (buffer.byteLength > 4 * 1024 * 1024) {
    throw new Error("errors:theme.audioTooLarge")
  }

  ensureMediaDirs()
  const soundsDir = getPath(`${MEDIA_ROOT}/sounds`)
  ensureDir(soundsDir)

  // Remove previous files for this slot so the folder doesn't grow unbounded.
  for (const file of fs.readdirSync(soundsDir)) {
    if (file.startsWith(`${slot}-`)) {
      fs.unlinkSync(resolve(soundsDir, file))
    }
  }
  removeManifestWhere(
    (item) =>
      item.category === "audio" &&
      item.source === "theme" &&
      item.filename.startsWith(`${slot}-`),
  )

  // Audio is NOT transcoded: write the decoded bytes verbatim, pick the
  // container ext from the MIME (.mp3/.wav/.ogg). Compute the timestamp ONCE so
  // the filename and the manifest id can never drift apart.
  const stamp = Date.now()
  const filename = `${slot}-${stamp}${extensionForMime(mime)}`
  fs.writeFileSync(resolve(soundsDir, filename), buffer)

  // Track in the manifest like backgrounds do, reusing createMediaMeta for the
  // id/uploadedAt fields. Files live under media/sounds/; the manifest
  // `category` is the closest valid MediaCategory ("audio"), so we override the
  // helper's derived `url` to point at the real /media/sounds/<file> location.
  upsertMediaMeta({
    ...createMediaMeta({
      filename,
      category: "audio",
      size: buffer.byteLength,
      type: "audio",
      source: "theme",
    }),
    url: `/media/sounds/${filename}`,
  })

  return `/media/sounds/${filename}`
}
