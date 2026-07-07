// Boot-time hydration: materialize Postgres state to config/ files (pg/pg-only modes).
// Invoked after initConfig() so the dir scaffold exists. Non-blocking: errors are
// logged per-category, boot continues, and a summary is emitted at the end.
import fs from "fs"
import { getPath, ensureDir } from "@razzoozle/socket/services/config/shared"
import { getQuizzPg } from "@razzoozle/socket/services/storage/quizz-pg"
import { listAllCatalogEntriesPg } from "@razzoozle/socket/services/storage/catalog-pg"
import { listAllResultsPg } from "@razzoozle/socket/services/storage/results-pg"
import { listAllSubmissionsPg } from "@razzoozle/socket/services/storage/submissions-pg"
import { listAllAchievementsPg } from "@razzoozle/socket/services/storage/achievements-pg"
import { listAllThemesPg } from "@razzoozle/socket/services/storage/theme-pg"

interface HydrationStats {
  quizzes: number
  catalog: number
  results: number
  submissions: number
  achievements: number
  themes: number
  templates: number
  errors: string[]
}

/**
 * Guard: only hydrate if DATABASE_MODE is pg or pg-only AND DATABASE_URL is set.
 */
const shouldHydrate = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  const hasDb = !!process.env.DATABASE_URL
  return (mode === "pg" || mode === "pg-only") && hasDb
}

/**
 * Hydrate config/quizz/<id>.json from DB quizzes.
 * Zombie-cleanup: delete quizz files whose ids are not in the DB list.
 */
async function hydrateQuizzes(stats: HydrationStats): Promise<void> {
  try {
    const quizzes = await getQuizzPg()
    const quizzDir = getPath("quizz")

    if (!fs.existsSync(quizzDir)) {
      fs.mkdirSync(quizzDir, { recursive: true })
    }

    // Write each quizz from DB
    for (const quizz of quizzes) {
      const filePath = getPath(`quizz/${quizz.id}.json`)
      const { id, ...data } = quizz
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    }

    // Zombie cleanup: delete files not in DB
    const dbIds = new Set(quizzes.map((q) => q.id))
    for (const file of fs.readdirSync(quizzDir)) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "")
        if (!dbIds.has(id)) {
          fs.unlinkSync(getPath(`quizz/${file}`))
        }
      }
    }

    stats.quizzes = quizzes.length
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("pg-hydration: quizzes failed:", msg)
    stats.errors.push(`quizzes: ${msg}`)
  }
}

/**
 * Hydrate config/catalog/<id>.json from DB catalog_entries.
 * Zombie-cleanup: delete catalog files whose ids are not in the DB list.
 */
async function hydrateCatalog(stats: HydrationStats): Promise<void> {
  try {
    const entries = await listAllCatalogEntriesPg()
    const catalogDir = getPath("catalog")

    if (!fs.existsSync(catalogDir)) {
      fs.mkdirSync(catalogDir, { recursive: true })
    }

    // Write each catalog entry from DB
    for (const entry of entries) {
      const filePath = getPath(`catalog/${entry.id}.json`)
      const { id, ...data } = entry
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    }

    // Zombie cleanup
    const dbIds = new Set(entries.map((e) => e.id))
    for (const file of fs.readdirSync(catalogDir)) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "")
        if (!dbIds.has(id)) {
          fs.unlinkSync(getPath(`catalog/${file}`))
        }
      }
    }

    stats.catalog = entries.length
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("pg-hydration: catalog failed:", msg)
    stats.errors.push(`catalog: ${msg}`)
  }
}

/**
 * Hydrate config/results/<id>.json from DB game_results.
 * Zombie-cleanup: delete result files whose ids are not in the DB list.
 */
async function hydrateResults(stats: HydrationStats): Promise<void> {
  try {
    const results = await listAllResultsPg()
    const resultsDir = getPath("results")

    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }

    // Write each result from DB
    for (const result of results) {
      const filePath = getPath(`results/${result.id}.json`)
      const { id, ...data } = result
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    }

    // Zombie cleanup
    const dbIds = new Set(results.map((r) => r.id))
    for (const file of fs.readdirSync(resultsDir)) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "")
        if (!dbIds.has(id)) {
          fs.unlinkSync(getPath(`results/${file}`))
        }
      }
    }

    stats.results = results.length
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("pg-hydration: results failed:", msg)
    stats.errors.push(`results: ${msg}`)
  }
}

/**
 * Hydrate config/submissions/<id>.json from DB submissions.
 * Zombie-cleanup: delete submission files whose ids are not in the DB list.
 */
async function hydrateSubmissions(stats: HydrationStats): Promise<void> {
  try {
    const submissions = await listAllSubmissionsPg()
    const submissionsDir = getPath("submissions")

    if (!fs.existsSync(submissionsDir)) {
      fs.mkdirSync(submissionsDir, { recursive: true })
    }

    // Write each submission from DB
    for (const submission of submissions) {
      const filePath = getPath(`submissions/${submission.id}.json`)
      const { id, ...data } = submission
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    }

    // Zombie cleanup
    const dbIds = new Set(submissions.map((s) => s.id))
    for (const file of fs.readdirSync(submissionsDir)) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "")
        if (!dbIds.has(id)) {
          fs.unlinkSync(getPath(`submissions/${file}`))
        }
      }
    }

    stats.submissions = submissions.length
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("pg-hydration: submissions failed:", msg)
    stats.errors.push(`submissions: ${msg}`)
  }
}

/**
 * Hydrate config/achievements.json from DB achievements_config.
 * Overwrites (no zombie cleanup: single file).
 */
async function hydrateAchievements(stats: HydrationStats): Promise<void> {
  try {
    const config = await listAllAchievementsPg()
    ensureDir(getPath())
    fs.writeFileSync(
      getPath("achievements.json"),
      JSON.stringify(config, null, 2),
    )
    stats.achievements = Object.keys(config).length
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("pg-hydration: achievements failed:", msg)
    stats.errors.push(`achievements: ${msg}`)
  }
}

/**
 * Hydrate config/theme/theme.json (active) and config/theme-templates/<id>.json (templates).
 * Zombie-cleanup: delete template files whose ids are not in the DB list.
 * Note: active theme id is always 'active', templates have their own ids.
 */
async function hydrateThemes(stats: HydrationStats): Promise<void> {
  try {
    const { active, templates } = await listAllThemesPg()

    const themeDir = getPath("theme")
    if (!fs.existsSync(themeDir)) {
      fs.mkdirSync(themeDir, { recursive: true })
    }

    const templatesDir = getPath("theme-templates")
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true })
    }

    // Write active theme (if present in DB)
    if (active) {
      fs.writeFileSync(
        getPath("theme/theme.json"),
        JSON.stringify(active, null, 2),
      )
    }

    // Write template themes from DB
    for (const template of templates) {
      const filePath = getPath(`theme-templates/${template.id}.json`)
      // Re-assemble the record shape for themeTemplateValidator
      const record = {
        id: template.id,
        name: template.name,
        theme: template.theme,
      }
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2))
    }

    // Zombie cleanup: delete template files not in DB (only templates, not the active theme)
    const dbTemplateIds = new Set(templates.map((t) => t.id))
    for (const file of fs.readdirSync(templatesDir)) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "")
        if (!dbTemplateIds.has(id)) {
          fs.unlinkSync(getPath(`theme-templates/${file}`))
        }
      }
    }

    stats.themes = active ? 1 : 0
    stats.templates = templates.length
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("pg-hydration: themes failed:", msg)
    stats.errors.push(`themes: ${msg}`)
  }
}

/**
 * Main hydration function: materialize all Postgres state to config/ files.
 * Guard: only runs if DATABASE_MODE=pg|pg-only and DATABASE_URL is set.
 * Error tolerance: category errors are logged and the process continues.
 * Returns a summary of what was hydrated.
 */
export async function hydrateConfigFromPg(): Promise<void> {
  if (!shouldHydrate()) {
    return
  }

  const stats: HydrationStats = {
    quizzes: 0,
    catalog: 0,
    results: 0,
    submissions: 0,
    achievements: 0,
    themes: 0,
    templates: 0,
    errors: [],
  }

  // Hydrate each category sequentially (order matters for fs operations).
  await hydrateQuizzes(stats)
  await hydrateCatalog(stats)
  await hydrateResults(stats)
  await hydrateSubmissions(stats)
  await hydrateAchievements(stats)
  await hydrateThemes(stats)

  // Emit summary
  const summary =
    `pg-hydration: ${stats.quizzes} quizzes, ` +
    `${stats.catalog} catalog, ` +
    `${stats.results} results, ` +
    `${stats.submissions} submissions, ` +
    `${stats.achievements} achievements, ` +
    `${stats.themes} active-theme, ` +
    `${stats.templates} templates`

  if (stats.errors.length > 0) {
    console.warn(`${summary} — errors: ${stats.errors.join("; ")}`)
  } else {
    console.log(summary)
  }
}
