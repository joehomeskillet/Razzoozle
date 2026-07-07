// Theme (colors + backgrounds + presets + revision ring). Extracted verbatim
// from services/config.ts (SRP split). Skeleton import/export lives in
// ./theme-skeleton (imports getTheme/setTheme from here).
import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import { themeValidator } from "@razzoozle/common/validators/theme"
import { z } from "zod"
import fs from "fs"
import { getPath } from "@razzoozle/socket/services/config/shared"
import { updateThemePg } from "@razzoozle/socket/services/storage/theme-pg"
import { saveThemeRevision } from "./revisions"

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

// DATABASE_MODE=dual/pg/pg-only: files stay the sync read source of truth for
// the theme functions below (they can't become async without breaking their
// existing sync call sites), but writes are additionally mirrored to
// Postgres via services/storage/theme-pg.ts (fire-and-forget, errors logged
// not thrown — file write remains authoritative and never blocks on the DB).
export const isDbBackedThemeMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "dual" || mode === "pg" || mode === "pg-only"
}

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

  if (isDbBackedThemeMode()) {
    updateThemePg(theme).catch((error) =>
      console.error("theme-pg mirror write failed:", error),
    )
  }

  return theme
}

export const themeTemplatesDir = () => getPath("theme-templates")

export const themeRevisionsFile = () => getPath("theme-revisions.json")
