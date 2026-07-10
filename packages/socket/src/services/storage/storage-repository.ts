import type { GameConfig } from "@razzoozle/common/validators/game-config"

/**
 * StorageRepository defines the interface for reading and writing game
 * configuration and related data. Implementations can be file-based or
 * database-backed.
 *
 * All methods are ASYNC (return Promises): the file-based implementation wraps
 * its synchronous disk access in a resolved Promise, while the Postgres
 * implementation is natively async. Consumers `await` the result.
 *
 * PHASE 1: intentionally minimal to unblock the manager-password migration.
 * Other methods (quizz, results, submissions, catalog, themes, media, ai,
 * achievements, plugins …) are added in a future wave — see the TODO block.
 */
export interface StorageRepository {
  /** Get the current game configuration (from file or DB). */
  getGameConfig(): Promise<GameConfig>

  /**
   * Update the game configuration with a partial patch.
   * @param patch Partial game config fields to merge
   * @param expectedVersion Optional optimistic-lock version (Postgres)
   */
  updateGameConfig(
    patch: Partial<GameConfig>,
    expectedVersion?: number,
  ): Promise<GameConfig>

  /** Get the manager password for authentication (plaintext, no hashing here). */
  getManagerPassword(): Promise<string>

  // ──────────────────────────────────────────────────────────────────────────
}
