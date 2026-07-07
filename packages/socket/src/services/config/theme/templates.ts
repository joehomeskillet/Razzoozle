import {
  type Theme,
  type ThemeTemplate,
  type ThemeTemplateMeta,
} from "@razzoozle/common/types/theme"
import { themeTemplateValidator } from "@razzoozle/common/validators/theme"
import { normalizeFilename } from "@razzoozle/socket/utils/game"
import fs from "fs"
import { assertSafeId, getPath } from "@razzoozle/socket/services/config/shared"
import {
  deleteThemeTemplatePg,
  upsertThemeTemplatePg,
} from "@razzoozle/socket/services/storage/theme-pg"
import { isDbBackedThemeMode, themeTemplatesDir } from "./core"

// ---- Theme templates (named theme presets) --------------------------------
// Each preset is a config/theme-templates/<id>.json ThemeTemplate { id, name,
// theme }. Reads validate every file through themeTemplateValidator (skipping
// invalid ones, like getCatalog/getSubmissions). The id is a server-derived safe
// slug of the name; every path interpolation is guarded by assertSafeId so a
// user-supplied id can never escape the theme-templates dir.

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

  if (isDbBackedThemeMode()) {
    upsertThemeTemplatePg(id, record.name, record.theme).catch((error) =>
      console.error(`theme-pg mirror write failed for template "${id}":`, error),
    )
  }

  return { id }
}

export const deleteThemeTemplate = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`theme-templates/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error("errors:themeTemplate.notFound")
  }

  fs.unlinkSync(filePath)

  if (isDbBackedThemeMode()) {
    deleteThemeTemplatePg(id).catch((error) =>
      console.error(`theme-pg mirror delete failed for template "${id}":`, error),
    )
  }
}
