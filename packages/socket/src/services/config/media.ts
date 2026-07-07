// Media assets (config/media/**, config/media-manifest.json) — upload/decode
// pipeline, manifest CRUD, avatars + AI-generated images. Extracted verbatim
// from services/config.ts (SRP split) — `export` was added to a handful of
// helpers (MEDIA_MANIFEST, MEDIA_ROOT, MEDIA_AUDIO_MIME, ensureMediaDirs,
// mediaFilePath, upsertMediaMeta, createMediaMeta, removeManifestWhere,
// decodeDataUrl, extensionForMime) that are now also consumed by ./theme and
// ./init (background/sound slot uploads + fresh-volume seeding reuse this same
// manifest pipeline); logic is unchanged.
import { AVATAR_MAX_BYTES, MEDIA_CATEGORIES, type MediaCategory } from "@razzoozle/common/constants"
import type { MediaMeta } from "@razzoozle/common/types/media"
import { toWebp, webpDimensions } from "@razzoozle/socket/services/webp"
import fs from "fs"
import { basename, extname, relative, resolve } from "path"
import { nanoid } from "nanoid"
import { assertSafeId, ensureDir, getPath } from "@razzoozle/socket/services/config/shared"

export const MEDIA_MANIFEST = "media-manifest.json"
export const MEDIA_ROOT = "media"
const MEDIA_IMAGE_MIME = /^image\/(?:png|jpeg|webp)$/u
export const MEDIA_AUDIO_MIME = /^audio\/(?:mpeg|mp3|wav|ogg)$/u
const MEDIA_VIDEO_MIME = /^video\/(?:mp4|webm|ogg)$/u
const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/u

export const ensureMediaDirs = (): void => {
  ensureDir(getPath(MEDIA_ROOT))

  for (const category of MEDIA_CATEGORIES) {
    ensureDir(getPath(`${MEDIA_ROOT}/${category}`))
  }
}

const isMediaCategory = (value: string): value is MediaCategory =>
  MEDIA_CATEGORIES.includes(value as MediaCategory)

const manifestPath = () => getPath(MEDIA_MANIFEST)

const readMediaManifest = (): MediaMeta[] => {
  const file = manifestPath()

  if (!fs.existsSync(file)) {
    return []
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((item): MediaMeta[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("id" in item) ||
        !("filename" in item) ||
        !("url" in item) ||
        !("size" in item) ||
        !("type" in item) ||
        !("category" in item) ||
        !("source" in item) ||
        !("uploadedAt" in item)
      ) {
        return []
      }

      const candidate = item as Record<string, unknown>

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.filename !== "string" ||
        typeof candidate.url !== "string" ||
        typeof candidate.size !== "number" ||
        (candidate.type !== "image" &&
          candidate.type !== "audio" &&
          candidate.type !== "video") ||
        typeof candidate.category !== "string" ||
        !isMediaCategory(candidate.category) ||
        (candidate.source !== "upload" &&
          candidate.source !== "ai" &&
          candidate.source !== "theme") ||
        typeof candidate.uploadedAt !== "string" ||
        // WP-6 — width/height are optional; only reject when present-but-not-number
        // (pre-existing rows without them MUST still load — no new required key).
        (candidate.width !== undefined &&
          typeof candidate.width !== "number") ||
        (candidate.height !== undefined && typeof candidate.height !== "number")
      ) {
        return []
      }

      // Construct the MediaMeta explicitly from the fields the guard above has
      // already narrowed (no `as unknown as MediaMeta` laundering — a stray
      // extra key on the manifest row never leaks back out on a re-write).
      const base: MediaMeta = {
        id: candidate.id,
        filename: candidate.filename,
        url: candidate.url,
        size: candidate.size,
        type: candidate.type,
        category: candidate.category,
        source: candidate.source,
        uploadedAt: candidate.uploadedAt,
      }

      // WP-6 — copy dims through only when both are numbers (clean JSON, no
      // undefined keys leaking back out on a re-write).
      return [
        typeof candidate.width === "number" &&
        typeof candidate.height === "number"
          ? { ...base, width: candidate.width, height: candidate.height }
          : base,
      ]
    })
  } catch {
    return []
  }
}

const writeMediaManifest = (items: MediaMeta[]): void => {
  fs.writeFileSync(manifestPath(), JSON.stringify(items, null, 2))
}

export const getMediaList = (): MediaMeta[] => readMediaManifest()

const normalizeMediaStem = (filename: string): string => {
  const stem = basename(filename, extname(filename))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64)

  return stem || "media"
}

export const extensionForMime = (mime: string): string => {
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    return ".webp"
  }

  if (mime === "audio/mpeg" || mime === "audio/mp3") {
    return ".mp3"
  }

  if (mime === "audio/wav") {
    return ".wav"
  }

  if (mime === "audio/ogg") {
    return ".ogg"
  }

  if (mime === "video/mp4") {
    return ".mp4"
  }

  if (mime === "video/webm") {
    return ".webm"
  }

  if (mime === "video/ogg") {
    return ".ogv"
  }

  throw new Error("errors:media.invalidDataUrl")
}

export const decodeDataUrl = (
  dataUrl: string,
  accepted: RegExp,
  invalidMessage: string,
): { mime: string; buffer: Buffer } => {
  const match = DATA_URL_RE.exec(dataUrl)

  if (!match || !accepted.test(match[1])) {
    throw new Error(invalidMessage)
  }

  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  }
}

const assertSafeFilename = (filename: string): void => {
  if (filename.startsWith("/") || filename.includes("\\")) {
    throw new Error("Invalid id")
  }

  for (const segment of filename.split("/")) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("Invalid id")
    }

    const stem = segment.replace(/\.[a-z0-9]+$/iu, "")
    assertSafeId(stem)
  }
}

export const mediaFilePath = (category: MediaCategory, filename: string): string => {
  assertSafeFilename(filename)

  const mediaRoot = resolve(getPath(MEDIA_ROOT))
  const target = resolve(mediaRoot, category, filename)
  const rel = relative(mediaRoot, target)

  if (
    rel.startsWith("..") ||
    rel === "" ||
    resolve(mediaRoot, rel) !== target
  ) {
    throw new Error("Invalid id")
  }

  return target
}

export const upsertMediaMeta = (meta: MediaMeta): MediaMeta => {
  const manifest = readMediaManifest().filter((item) => item.id !== meta.id)
  writeMediaManifest([...manifest, meta])

  return meta
}

export const removeManifestWhere = (
  predicate: (_item: MediaMeta) => boolean,
): void => {
  writeMediaManifest(readMediaManifest().filter((item) => !predicate(item)))
}

export const createMediaMeta = (input: {
  filename: string
  category: MediaCategory
  size: number
  type: "image" | "audio" | "video"
  source: MediaMeta["source"]
  // WP-6 — optional image dimensions; only written when both are present.
  width?: number
  height?: number
}): MediaMeta => {
  const id = `${input.category}-${input.filename.replace(/\.[a-z0-9]+$/iu, "")}`
  assertSafeId(id)

  return {
    id,
    filename: input.filename,
    url: `/media/${input.category}/${input.filename}`,
    size: input.size,
    type: input.type,
    category: input.category,
    source: input.source,
    uploadedAt: new Date().toISOString(),
    // WP-6 — only set dims when both are provided (no undefined keys in the JSON).
    ...(input.width !== undefined && input.height !== undefined
      ? { width: input.width, height: input.height }
      : {}),
  }
}

export const saveMediaFile = async (
  dataUrl: string,
  filename: string,
  category?: MediaCategory,
): Promise<MediaMeta> => {
  const { mime, buffer } = decodeDataUrl(
    dataUrl,
    /^(?:image|audio|video)\//u,
    "errors:media.invalidDataUrl",
  )
  const inferredType = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("audio/")
      ? "audio"
      : "image"
  const resolvedCategory =
    category ?? (inferredType === "audio" ? "audio" : "questions")

  if (!isMediaCategory(resolvedCategory)) {
    throw new Error("errors:media.invalidCategory")
  }

  if (inferredType === "image" && !MEDIA_IMAGE_MIME.test(mime)) {
    throw new Error("errors:media.invalidDataUrl")
  }

  if (inferredType === "audio" && !MEDIA_AUDIO_MIME.test(mime)) {
    throw new Error("errors:media.invalidDataUrl")
  }

  if (inferredType === "video" && !MEDIA_VIDEO_MIME.test(mime)) {
    throw new Error("errors:media.invalidDataUrl")
  }

  ensureMediaDirs()

  const safeStem = normalizeMediaStem(filename)
  const storedFilename = `${safeStem}-${nanoid(8)}${extensionForMime(mime)}`
  const output =
    inferredType === "image" ? await toWebp(buffer) : Buffer.from(buffer)
  const target = mediaFilePath(resolvedCategory, storedFilename)
  fs.writeFileSync(target, output)

  // WP-6 — for images, probe the WebP output buffer for its pixel dimensions.
  // Pure-JS parse; null on an unrecognized buffer → dims are simply omitted.
  const dims = inferredType === "image" ? webpDimensions(output) : null

  return upsertMediaMeta(
    createMediaMeta({
      filename: storedFilename,
      category: resolvedCategory,
      size: output.byteLength,
      type: inferredType,
      source: "upload",
      width: dims?.width,
      height: dims?.height,
    }),
  )
}

export const deleteMediaFile = (id: string): void => {
  assertSafeId(id)

  const manifest = readMediaManifest()
  const item = manifest.find((entry) => entry.id === id)

  if (!item) {
    throw new Error("errors:media.notFound")
  }

  const target = mediaFilePath(item.category, item.filename)

  if (fs.existsSync(target)) {
    fs.unlinkSync(target)
  }

  writeMediaManifest(manifest.filter((entry) => entry.id !== id))
}

export const saveEphemeralAvatar = async (
  gameId: string,
  playerId: string,
  dataUrl: string,
): Promise<string> => {
  assertSafeId(gameId)
  assertSafeId(playerId)

  const { buffer } = decodeDataUrl(
    dataUrl,
    MEDIA_IMAGE_MIME,
    "errors:avatar.invalid",
  )

  if (buffer.byteLength > AVATAR_MAX_BYTES) {
    throw new Error("errors:avatar.tooLarge")
  }

  const webp = await toWebp(buffer)

  if (webp.byteLength > AVATAR_MAX_BYTES) {
    throw new Error("errors:avatar.tooLarge")
  }

  const dir = getPath(`${MEDIA_ROOT}/avatars/${gameId}`)
  ensureDir(dir)
  fs.writeFileSync(resolve(dir, `${playerId}.webp`), webp)

  return `/media/avatars/${gameId}/${playerId}.webp`
}

export const deleteGameAvatars = (gameId: string): void => {
  assertSafeId(gameId)
  fs.rmSync(getPath(`${MEDIA_ROOT}/avatars/${gameId}`), {
    recursive: true,
    force: true,
  })
}

export const cleanupStaleAvatars = (activeGameIds: Iterable<string>): void => {
  const active = new Set(activeGameIds)
  const root = getPath(`${MEDIA_ROOT}/avatars`)

  if (!fs.existsSync(root)) {
    return
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "generic") {
      continue
    }

    if (!active.has(entry.name)) {
      fs.rmSync(resolve(root, entry.name), { recursive: true, force: true })
    }
  }
}

// Persist ComfyUI-produced WebP bytes into config/media/generated under a
// server-generated name and return its public "/media/generated/<file>" path.
// The bytes are fetched over HTTP by the caller so the socket container never
// needs to reach the ComfyUI host filesystem. `destName` is server-generated
// (gen-<nanoid>.webp) and re-checked with assertSafeId stem.
export const saveGeneratedImageBytes = (
  buffer: Buffer,
  destName: string,
): string => {
  const stem = destName.replace(/\.[a-z0-9]+$/u, "")
  assertSafeId(stem)

  ensureMediaDirs()
  const target = mediaFilePath("generated", destName)
  fs.writeFileSync(target, buffer)

  upsertMediaMeta(
    createMediaMeta({
      filename: destName,
      category: "generated",
      size: buffer.byteLength,
      type: "image",
      source: "ai",
    }),
  )

  return `/media/generated/${destName}`
}
