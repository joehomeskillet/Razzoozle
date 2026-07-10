// P3 — the single read seam (WP-0). Every Node config READ that a caller
// switches over to in WP-1 routes through one of the async functions below:
// `if (dbReadMode()) return await <*-pg>()` else the EXISTING sync file
// reader from services/config/** (unchanged). No cache anywhere — a "pg" call
// is one fresh DB round-trip per invocation, matching the existing sync file
// reads (which are themselves un-cached bar quizz.ts's own mtime-guarded
// cache, left untouched here). Writes + boot-hydrate are OUT of scope — see
// .claude/state/P3_node_pg_native_contract.md.
import { DEFAULT_THEME, type Theme, type ThemeTemplate, type ThemeTemplateMeta, type ThemeRevision } from "@razzoozle/common/types/theme"
import type {
  GameResult,
  GameResultMeta,
  QuizzMeta,
  QuizzWithId,
} from "@razzoozle/common/types/game"
import type { CatalogEntry } from "@razzoozle/common/types/catalog"
import type { Submission, SubmissionMeta } from "@razzoozle/common/types/submission"
import type { AchievementsConfig } from "@razzoozle/common/validators/achievements"
import type { MergedAchievement } from "@razzoozle/common/achievements"
import type { Assignment } from "@razzoozle/common/validators/assignment"
import type { GameConfig } from "@razzoozle/common/validators/game-config"
import type { SoloScoreEntry } from "@razzoozle/socket/services/config/solo-results"

import {
  getAchievementsConfig,
  getAssignment,
  getCatalog,
  getCatalogById,
  getGameConfig,
  getMergedAchievements,
  getQuizz,
  getQuizzById,
  getQuizzMeta,
  getResultById,
  getResultsMeta,
  getSoloResults,
  getSubmissionById,
  getSubmissions,
  getSubmissionsMeta,
  getTheme,
  getThemeRevisionById,
  getThemeRevisions,
  getThemeTemplateById,
  getThemeTemplates,
  getThemeTemplatesMeta,
  countPendingSubmissions as countPendingSubmissionsFile,
  listAssignments as listAssignmentsFile,
} from "@razzoozle/socket/services/config"

import { getGameConfigPg } from "@razzoozle/socket/services/storage/game-config-pg"
import { getQuizzByIdPg, getQuizzMetaPg, getQuizzPg } from "@razzoozle/socket/services/storage/quizz-pg"
import {
  getCatalogEntryByIdPg,
  listAllCatalogEntriesPg,
} from "@razzoozle/socket/services/storage/catalog-pg"
import { getResultByIdPg, listAllResultsPg } from "@razzoozle/socket/services/storage/results-pg"
import {
  countPendingSubmissionsPg,
  getSubmissionByIdPg,
  listAllSubmissionsPg,
} from "@razzoozle/socket/services/storage/submissions-pg"
import {
  getMergedAchievementsPg,
  listAllAchievementsPg,
} from "@razzoozle/socket/services/storage/achievements-pg"
import { getThemeTemplateByIdPg, listAllThemesPg } from "@razzoozle/socket/services/storage/theme-pg"
import { listSoloResultsPg } from "@razzoozle/socket/services/storage/solo-results-pg"
import {
  getAssignmentByIdPg,
  listAllAssignmentsPg,
} from "@razzoozle/socket/services/storage/assignments-pg"
import {
  getThemeRevisionByIdPg,
  listThemeRevisionsPg,
} from "@razzoozle/socket/services/storage/theme-revisions-pg"

// pg/pg-only only (mirrors hydrate-pg.ts's shouldHydrate naming style, scoped
// tighter: `dual` still reads files here — only its WRITES additionally
// mirror to Postgres).
const dbReadMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "pg" || mode === "pg-only"
}

// ---- game config ------------------------------------------------------------

export const readGameConfig = async (): Promise<GameConfig> =>
  dbReadMode() ? getGameConfigPg() : getGameConfig()

// ---- quizz -------------------------------------------------------------------

export const readQuizzMeta = async (): Promise<QuizzMeta[]> =>
  dbReadMode() ? getQuizzMetaPg() : getQuizzMeta()

export const readQuizzById = async (id: string): Promise<QuizzWithId> =>
  dbReadMode() ? getQuizzByIdPg(id) : getQuizzById(id)

export const readQuizz = async (): Promise<QuizzWithId[]> =>
  dbReadMode() ? getQuizzPg() : getQuizz()

// ---- catalog -----------------------------------------------------------------

export const readCatalog = async (): Promise<CatalogEntry[]> =>
  dbReadMode() ? listAllCatalogEntriesPg() : getCatalog()


// ---- results -------------------------------------------------------------------

export const readResultsMeta = async (): Promise<GameResultMeta[]> => {
  if (!dbReadMode()) {
    return getResultsMeta()
  }

  const results = await listAllResultsPg()

  // listAllResultsPg's SQL already orders by date DESC (mirrors getResultsMeta's
  // own sort), so no re-sort is needed here.
  return results.map(
    (r): GameResultMeta => ({
      id: r.id,
      subject: r.subject,
      date: r.date,
      playerCount: r.players.length,
    }),
  )
}

export const readResultById = async (id: string): Promise<GameResult> =>
  dbReadMode() ? getResultByIdPg(id) : getResultById(id)

// ---- submissions ---------------------------------------------------------------

export const readSubmissions = async (): Promise<Submission[]> =>
  dbReadMode() ? listAllSubmissionsPg() : getSubmissions()

export const countPendingSubmissions = async (): Promise<number> =>
  dbReadMode() ? countPendingSubmissionsPg() : countPendingSubmissionsFile()

export const readSubmissionsMeta = async (): Promise<SubmissionMeta[]> => {
  if (!dbReadMode()) {
    return getSubmissionsMeta()
  }

  const submissions = await listAllSubmissionsPg()

  return submissions.map(
    ({ id, submittedBy, submittedAt, status, question }): SubmissionMeta => ({
      id,
      submittedBy,
      submittedAt,
      status,
      question: question.question,
    }),
  )
}

export const readSubmissionById = async (id: string): Promise<Submission | null> =>
  dbReadMode() ? getSubmissionByIdPg(id) : getSubmissionById(id)

// ---- achievements --------------------------------------------------------------


export const readMergedAchievements = async (): Promise<MergedAchievement[]> =>
  dbReadMode() ? getMergedAchievementsPg() : getMergedAchievements()

// ---- theme / theme templates -----------------------------------------------------

export const readTheme = async (): Promise<Theme> => {
  if (!dbReadMode()) {
    return getTheme()
  }

  const { active } = await listAllThemesPg()

  // Mirrors getTheme()'s missing-file fallback.
  return active ?? DEFAULT_THEME
}

export const readThemeTemplates = async (): Promise<ThemeTemplate[]> => {
  if (!dbReadMode()) {
    return getThemeTemplates()
  }

  const { templates } = await listAllThemesPg()

  return templates
}

export const readThemeTemplatesMeta = async (): Promise<ThemeTemplateMeta[]> => {
  if (!dbReadMode()) {
    return getThemeTemplatesMeta()
  }

  const { templates } = await listAllThemesPg()

  return templates.map(({ id, name }) => ({ id, name }))
}

export const readThemeTemplateById = async (id: string): Promise<ThemeTemplate | null> =>
  dbReadMode() ? getThemeTemplateByIdPg(id) : getThemeTemplateById(id)

// ---- solo results ----------------------------------------------------------------

export const readSoloResults = async (quiz: string): Promise<SoloScoreEntry[]> =>
  dbReadMode() ? listSoloResultsPg(quiz) : getSoloResults(quiz)

// ---- assignments -------------------------------------------------------------------

export const readAssignment = async (id: string): Promise<Assignment | null> =>
  dbReadMode() ? getAssignmentByIdPg(id) : getAssignment(id)


// ---- theme revisions ----------------------------------------------------------------

export const readThemeRevisions = async (): Promise<ThemeRevision[]> =>
  dbReadMode() ? listThemeRevisionsPg() : getThemeRevisions()

export const readThemeRevisionById = async (id: string): Promise<ThemeRevision | null> =>
  dbReadMode() ? getThemeRevisionByIdPg(id) : getThemeRevisionById(id)

// ---- media ----------------------------------------------------------------

import { listMediaAssetsPg } from "@razzoozle/socket/services/storage/media-pg"
import { getMediaList } from "@razzoozle/socket/services/config/media"
import type { MediaMeta } from "@razzoozle/common/types/media"

export const readMediaList = async (): Promise<MediaMeta[]> =>
  dbReadMode() ? listMediaAssetsPg() : getMediaList()
