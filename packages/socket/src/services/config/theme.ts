// Theme (colors + backgrounds + presets + revision ring). Extracted verbatim
// from services/config.ts (SRP split). Skeleton import/export lives in
// ./theme-skeleton (imports getTheme/setTheme from here).
import {
  DEFAULT_THEME,
  type Theme,
  type ThemeRevision,
  type ThemeTemplate,
  type ThemeTemplateMeta,
} from "@razzoozle/common/types/theme"
import {
  themeRevisionValidator,
  themeTemplateValidator,
  themeValidator,
} from "@razzoozle/common/validators/theme"
import {
  THEME_REVISIONS_MAX,
  SOUND_SLOTS,
  THEME_SLOTS,
  type SoundSlot,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import { normalizeFilename } from "@razzoozle/socket/utils/game"
import { toWebp } from "@razzoozle/socket/services/webp"
import { z } from "zod"
import fs from "fs"
import { resolve } from "path"
import { assertSafeId, ensureDir, getPath } from "@razzoozle/socket/services/config/shared"
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

const safeAssetPath = (value: string): boolean => {
  if (/^\/theme\/[\w.-]+$/u.test(value)) {
    return true
  }

  if (!value.startsWith("/media/")) {
    return false
  }

  const segments = value.slice("/media/".length).split("/")

  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        /^[A-Za-z0-9_.-]+$/u.test(segment),
    )
  )
}

const assetRef = z
  .string()
  .refine(safeAssetPath, "errors:theme.invalidAsset")
  .nullable()

const socketThemeValidator = z.object({
  style: z.enum(["flat", "glass"]).default("flat"),
  colorPrimary: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
  colorSecondary: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
  colorText: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")
    .default("#ffffff"),
  answerColors: z.tuple([
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
  ]),
  answerTextColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")
    .default("#ffffff"),
  accentColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")
    .default("#ff9900"),
  radius: z.number().min(0).max(40).default(16),
  scrim: z.number().min(0).max(100).default(40),
  appTitle: z.string().max(40).nullable().default(null),
  logo: assetRef.default(null),
  showBranding: z.boolean().default(true),
  backgrounds: z.object({
    auth: assetRef,
    managerGame: assetRef,
    playerGame: assetRef,
  }),
})

const parseTheme = (data: unknown): Theme => {
  const commonResult = themeValidator.safeParse(data)

  if (commonResult.success) {
    return commonResult.data
  }

  const socketResult = socketThemeValidator.safeParse(data)

  if (!socketResult.success) {
    throw socketResult.error
  }

  // The lenient socket fallback validator predates the extended theme fields;
  // merge over DEFAULT_THEME so the result is always a complete Theme.
  return {
    ...DEFAULT_THEME,
    ...socketResult.data,
    backgrounds: {
      ...DEFAULT_THEME.backgrounds,
      ...socketResult.data.backgrounds,
    },
  }
}

// ---- Theme (backgrounds + colors) ---------------------------------------
// THEME_SLOTS / ThemeSlot are imported from @razzoozle/common (single source of
// truth shared with the web client). The runtime guard below is unchanged.

export const getTheme = (): Theme => {
  const filePath = getPath("theme/theme.json")

  if (!fs.existsSync(filePath)) {
    return DEFAULT_THEME
  }

  try {
    return parseTheme(JSON.parse(fs.readFileSync(filePath, "utf-8")))
  } catch (error) {
    console.error("Failed to read theme:", error)

    return DEFAULT_THEME
  }
}

export const setTheme = (
  data: unknown,
  opts?: { snapshot?: boolean },
): Theme => {
  let theme: Theme

  try {
    theme = parseTheme(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(error.issues[0].message)
    }

    throw error
  }

  // WP-18 — capture the CURRENT on-disk theme as a revision BEFORE overwriting it.
  // Defaults to true: the only callsite is the auth-gated admin SET_THEME path,
  // so every admin save (and every restore) is snapshotted and undoable. A
  // future non-admin auto-apply callsite must pass { snapshot: false } to avoid
  // polluting the ring. parseTheme already validated `data`, so the snapshot
  // happens only on a save we know will succeed.
  if (opts?.snapshot ?? true) {
    saveThemeRevision(getTheme())
  }

  const themeDir = getPath("theme")

  if (!fs.existsSync(themeDir)) {
    fs.mkdirSync(themeDir)
  }

  fs.writeFileSync(getPath("theme/theme.json"), JSON.stringify(theme, null, 2))

  return theme
}

// ---- Theme templates (named theme presets) --------------------------------
// Each preset is a config/theme-templates/<id>.json ThemeTemplate { id, name,
// theme }. Reads validate every file through themeTemplateValidator (skipping
// invalid ones, like getCatalog/getSubmissions). The id is a server-derived safe
// slug of the name; every path interpolation is guarded by assertSafeId so a
// user-supplied id can never escape the theme-templates dir.

const themeTemplatesDir = () => getPath("theme-templates")

export const getThemeTemplates = (): ThemeTemplate[] => {
  const dir = themeTemplatesDir()

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const raw = fs.readFileSync(getPath(`theme-templates/${file}`), "utf-8")
        const result = themeTemplateValidator.safeParse(JSON.parse(raw))

        if (!result.success) {
          console.warn(
            `Invalid theme-template file "${file}":`,
            result.error.issues,
          )

          return []
        }

        const id = file.replace(".json", "")

        return [{ ...result.data, id } as ThemeTemplate]
      } catch {
        return []
      }
    })
}

export const getThemeTemplatesMeta = (): ThemeTemplateMeta[] =>
  getThemeTemplates().map(({ id, name }) => ({ id, name }))

export const getThemeTemplateById = (id: string): ThemeTemplate | null => {
  assertSafeId(id)

  const filePath = getPath(`theme-templates/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = themeTemplateValidator.safeParse(JSON.parse(raw))

    return result.success ? ({ ...result.data, id } as ThemeTemplate) : null
  } catch {
    return null
  }
}

export const saveThemeTemplate = (payload: {
  name: string
  theme: Theme
}): { id: string } => {
  // Dedupe-on-save: if a template already exists under the same display name
  // (normalized + trimmed + case-insensitive), reuse its id so a re-save
  // overwrites in place instead of creating a duplicate. Only a genuinely new
  // name gets a fresh slug+nanoid id.
  const normalizedName = payload.name.trim().toLowerCase()
  const existing = getThemeTemplates().find(
    (t) => t.name.trim().toLowerCase() === normalizedName,
  )
  const id = existing ? existing.id : normalizeFilename(payload.name)
  assertSafeId(id)

  const record: ThemeTemplate = { id, name: payload.name, theme: payload.theme }

  // Re-validate the fully-assembled record before persisting so a hand-built
  // payload gets the same guarantees as a wire SAVE.
  const validated = themeTemplateValidator.safeParse(record)

  if (!validated.success) {
    throw new Error(validated.error.issues[0].message)
  }

  const dir = themeTemplatesDir()

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(
    getPath(`theme-templates/${id}.json`),
    JSON.stringify(record, null, 2),
  )

  return { id }
}

export const deleteThemeTemplate = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`theme-templates/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error("errors:themeTemplate.notFound")
  }

  fs.unlinkSync(filePath)
}

// ---- Theme revisions (per-save version ring) ------------------------------
// A single rolling config/theme-revisions.json array (newest-first), capped at
// THEME_REVISIONS_MAX. Each prior theme is snapshotted before an admin SET_THEME
// (see setTheme). Reads validate every entry via themeRevisionValidator and drop
// invalid ones (like getThemeTemplates); a missing file yields []. No per-file id
// slugging → no extra path-traversal surface (single fixed filename).

const themeRevisionsFile = () => getPath("theme-revisions.json")

export const getThemeRevisions = (): ThemeRevision[] => {
  const file = themeRevisionsFile()

  if (!fs.existsSync(file)) {
    return []
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown
    // Tolerate both a bare array and a { revisions: [...] } wrapper.
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { revisions?: unknown })?.revisions)
        ? (parsed as { revisions: unknown[] }).revisions
        : []

    return arr.flatMap((entry) => {
      const result = themeRevisionValidator.safeParse(entry)

      if (!result.success) {
        console.warn("Invalid theme revision entry:", result.error.issues)

        return []
      }

      return [result.data as ThemeRevision]
    })
  } catch (error) {
    console.error("Failed to read theme revisions:", error)

    return []
  }
}

export const getThemeRevisionById = (id: string): ThemeRevision | null =>
  getThemeRevisions().find((rev) => rev.id === id) ?? null

export const saveThemeRevision = (theme: Theme): { id: string } => {
  const id = `rev-${Date.now()}`
  const record: ThemeRevision = {
    id,
    createdAt: new Date().toISOString(),
    theme,
  }

  // unshift newest, cap at THEME_REVISIONS_MAX (oldest dropped).
  const next = [record, ...getThemeRevisions()].slice(0, THEME_REVISIONS_MAX)

  fs.writeFileSync(themeRevisionsFile(), JSON.stringify(next, null, 2))

  return { id }
}

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
