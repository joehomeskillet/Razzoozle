// ---- Catalog (reusable question bank) -------------------------------------
// Each entry is a config/catalog/<id>.json CatalogEntry. Reads validate every
// file through catalogEntryValidator (skipping invalid ones, like getSubmissions).
// Every path interpolation is guarded by assertSafeId so a user-supplied id can
// never escape the catalog dir.
// Extracted verbatim from services/config.ts (SRP split).
import type { CatalogEntry } from "@razzoozle/common/types/catalog"
import {
  catalogAddValidator,
  catalogEntryValidator,
} from "@razzoozle/common/validators/catalog"
import { normalizeFilename } from "@razzoozle/socket/utils/game"
import { z } from "zod"
import fs from "fs"
import { assertSafeId, getPath } from "@razzoozle/socket/services/config/shared"

export const getCatalog = (): CatalogEntry[] => {
  const dir = getPath("catalog")

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const raw = fs.readFileSync(getPath(`catalog/${file}`), "utf-8")
        const result = catalogEntryValidator.safeParse(JSON.parse(raw))

        if (!result.success) {
          console.warn(`Invalid catalog file "${file}":`, result.error.issues)

          return []
        }

        const id = file.replace(".json", "")

        return [{ ...result.data, id } as CatalogEntry]
      } catch {
        return []
      }
    })
}

export const getCatalogById = (id: string): CatalogEntry | null => {
  assertSafeId(id)

  const filePath = getPath(`catalog/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = catalogEntryValidator.safeParse(JSON.parse(raw))

    return result.success ? ({ ...result.data, id } as CatalogEntry) : null
  } catch {
    return null
  }
}

export const saveCatalogEntry = (
  payload: z.infer<typeof catalogAddValidator>,
): CatalogEntry => {
  // Re-validate the inbound payload so callers passing a hand-built object (e.g.
  // approve-to-catalog) get the SAME superRefine guarantees as a wire ADD.
  const parsed = catalogAddValidator.safeParse(payload)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  const dir = getPath("catalog")

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Derive a safe id from the question text; dedupe with a -2/-3 suffix so two
  // entries with identical text don't clobber each other.
  const baseId = normalizeFilename(parsed.data.question.question)
  let id = baseId
  let suffix = 2

  while (fs.existsSync(getPath(`catalog/${id}.json`))) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }

  assertSafeId(id)

  const entry: CatalogEntry = {
    id,
    question: parsed.data.question,
    tags: parsed.data.tags,
    source: parsed.data.source ?? "manual",
    addedAt: new Date().toISOString(),
  }

  // Validate the fully-assembled entry before persisting.
  const validated = catalogEntryValidator.safeParse(entry)

  if (!validated.success) {
    throw new Error(validated.error.issues[0].message)
  }

  fs.writeFileSync(
    getPath(`catalog/${id}.json`),
    JSON.stringify(entry, null, 2),
  )

  return entry
}

export const updateCatalogEntry = (
  id: string,
  data: { question: CatalogEntry["question"]; tags?: string[] },
): CatalogEntry => {
  assertSafeId(id)

  const existing = getCatalogById(id)

  if (!existing) {
    throw new Error("errors:catalog.notFound")
  }

  const entry: CatalogEntry = {
    ...existing,
    id,
    question: data.question,
    tags: data.tags,
  }

  const validated = catalogEntryValidator.safeParse(entry)

  if (!validated.success) {
    throw new Error(validated.error.issues[0].message)
  }

  fs.writeFileSync(
    getPath(`catalog/${id}.json`),
    JSON.stringify(entry, null, 2),
  )

  return entry
}

export const deleteCatalogEntry = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`catalog/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error("errors:catalog.notFound")
  }

  fs.unlinkSync(filePath)
}
