import { type Theme, type ThemeRevision } from "@razzoozle/common/types/theme"
import { themeRevisionValidator } from "@razzoozle/common/validators/theme"
import { THEME_REVISIONS_MAX } from "@razzoozle/common/constants"
import { insertThemeRevisionPg } from "@razzoozle/socket/services/storage/theme-revisions-pg"
import fs from "fs"
import { themeRevisionsFile } from "./core"

// ---- Theme revisions (per-save version ring) ------------------------------
// A single rolling config/theme-revisions.json array (newest-first), capped at
// THEME_REVISIONS_MAX. Each prior theme is snapshotted before an admin SET_THEME
// (see setTheme). Reads validate every entry via themeRevisionValidator and drop
// invalid ones (like getThemeTemplates); a missing file yields []. No per-file id
// slugging → no extra path-traversal surface (single fixed filename).

// Guard: only mirror to PG if DATABASE_MODE is dual/pg/pg-only
const isDbBackedThemeRevMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "dual" || mode === "pg" || mode === "pg-only"
}

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

  // Fire-and-forget pg mirror write
  if (isDbBackedThemeRevMode()) {
    insertThemeRevisionPg(record).catch((error) =>
      console.error("theme-revisions-pg mirror failed", error),
    )
  }

  return { id }
}
