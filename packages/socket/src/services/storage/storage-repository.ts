import type { GameConfig } from "@razzoozle/common/validators/game-config"

/**
 * StorageRepository defines the interface for reading and writing game configuration
 * and related data. Implementations can be file-based or database-backed.
 *
 * PHASE 1: This interface is intentionally minimal to unblock the manager-password
 * migration. Other methods (quizz, results, submissions, catalog, themes, etc.)
 * will be added in a future wave.
 */
export interface StorageRepository {
  /**
   * Get the current game configuration (reading from file or DB).
   */
  getGameConfig(): GameConfig

  /**
   * Update the game configuration with a partial patch.
   * @param patch Partial game config fields to merge
   * @param expectedVersion Optional optimistic lock version (for Postgres future support)
   */
  updateGameConfig(
    patch: Partial<GameConfig>,
    expectedVersion?: number,
  ): GameConfig

  /**
   * Get the manager password for authentication.
   * Returns the plaintext password (no hashing at this phase).
   */
  getManagerPassword(): string

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2+ TODO: Additional methods to be implemented in a future wave
  // ──────────────────────────────────────────────────────────────────────────
  // getQuizzById(id: string): Promise<QuizzWithId>
  // getQuizz(): Promise<QuizzWithId[]>
  // updateQuizz(id: string, data: unknown): Promise<{ id: string }>
  // setQuizzArchived(id: string, archived: boolean): Promise<void>
  // deleteQuizz(id: string): Promise<void>
  // saveResult(data: GameResult): Promise<void>
  // getResultsMeta(): Promise<GameResultMeta[]>
  // getResultById(id: string): Promise<GameResult>
  // deleteResult(id: string): Promise<void>
  // saveSubmission(data: Submission): Promise<void>
  // getSubmissions(): Promise<Submission[]>
  // countPendingSubmissions(): Promise<number>
  // getSubmissionsMeta(): Promise<SubmissionMeta[]>
  // getSubmissionById(id: string): Promise<Submission | null>
  // updateSubmission(id: string, data: Partial<Submission>): Promise<void>
  // deleteSubmission(id: string): Promise<void>
  // getCatalog(): Promise<CatalogEntry[]>
  // getCatalogById(id: string): Promise<CatalogEntry | null>
  // saveCatalogEntry(payload: any): Promise<CatalogEntry>
  // updateCatalogEntry(id: string, data: any): Promise<CatalogEntry>
  // deleteCatalogEntry(id: string): Promise<void>
  // getThemeTemplates(): Promise<ThemeTemplate[]>
  // getThemeTemplatesMeta(): Promise<ThemeTemplateMeta[]>
  // getThemeTemplateById(id: string): Promise<ThemeTemplate | null>
  // saveThemeTemplate(payload: any): Promise<{ id: string }>
  // deleteThemeTemplate(id: string): Promise<void>
  // getMediaList(): Promise<MediaMeta[]>
  // saveMediaFile(dataUrl: string, filename: string, category?: MediaCategory): Promise<MediaMeta>
  // getMediaById(id: string): Promise<MediaMeta | null>
  // getAISettings(): Promise<AISettings>
  // setAISettings(payload: unknown): Promise<AISettings>
  // getAchievementsConfig(): Promise<AchievementsConfig>
  // saveAchievementsConfig(patch: AchievementsConfig): Promise<AchievementsConfig>
  // readPlugins(): Promise<InstalledPlugin[]>
  // writePlugins(plugins: InstalledPlugin[]): Promise<void>
  // And more as needed for themes, media, plugins, etc.
}
