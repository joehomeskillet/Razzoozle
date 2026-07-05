import type { StorageRepository } from "./storage-repository"
import type { GameConfig } from "@razzoozle/common/validators/game-config"
import { gameConfigValidator } from "@razzoozle/common/validators/game-config"
import { DEFAULT_MANAGER_PASSWORD } from "@razzoozle/common/constants"

// Lazy-load pg to avoid requiring it when using FileSystemRepository
let Pool: any = null
try {
  // eslint-disable-next-line global-require
  const pg = require("pg")
  Pool = pg.Pool
} catch {
  // pg not installed or not available; PostgresRepository will fail at runtime
}

/**
 * PostgresRepository implements StorageRepository by reading from a Postgres
 * database. This is used when DATABASE_MODE is set to 'pg' or 'pg-only'.
 *
 * PHASE 1: Read-only support. Falls back to hardcoded defaults if DB is empty
 * or unreachable, logging a warning.
 *
 * Schema: games_config table with columns:
 *   id VARCHAR(100) PRIMARY KEY
 *   manager_password VARCHAR(255)
 *   team_mode BOOLEAN
 *   join_locked BOOLEAN
 *   randomize_answers BOOLEAN
 *   scoring_mode VARCHAR(20)
 *   low_latency_enabled BOOLEAN
 *   low_latency_config JSONB
 *   version INT
 *   created_at TIMESTAMP
 *   updated_at TIMESTAMP
 */
export class PostgresRepository implements StorageRepository {
  private pool: any = null

  constructor(databaseUrl: string) {
    if (!Pool) {
      throw new Error(
        "pg package not installed. Install with: pnpm add pg",
      )
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }

  /**
   * Get the current game configuration from the database.
   * Falls back to defaults if the DB is empty or the query fails.
   */
  async getGameConfig(): Promise<GameConfig> {
    try {
      const result = await this.pool.query(
        `SELECT
          manager_password,
          team_mode,
          join_locked,
          randomize_answers,
          scoring_mode,
          low_latency_enabled,
          low_latency_config,
          version
        FROM games_config WHERE id = $1`,
        ["default"],
      )

      if (result.rows.length === 0) {
        console.warn(
          "PostgresRepository: games_config row not found, using defaults",
        )
        return gameConfigValidator.parse({})
      }

      const row = result.rows[0]

      // Reconstruct GameConfig from DB columns
      const gameConfig: GameConfig = {
        managerPassword: row.manager_password || DEFAULT_MANAGER_PASSWORD,
        teamMode: row.team_mode ?? false,
        joinLocked: row.join_locked ?? false,
        randomizeAnswers: row.randomize_answers ?? false,
        scoringMode: row.scoring_mode ?? "speed",
        lowLatencyMode: {
          enabled: row.low_latency_enabled ?? false,
          // Merge defaults with any persisted low_latency_config JSONB
          ...(row.low_latency_config || {}),
        },
      }

      // Validate through the schema to ensure consistency
      const validated = gameConfigValidator.safeParse(gameConfig)
      if (!validated.success) {
        console.error(
          "PostgresRepository: invalid game config from DB, using defaults",
          validated.error.issues,
        )
        return gameConfigValidator.parse({})
      }

      return validated.data
    } catch (error) {
      console.error("PostgresRepository: failed to read game config", error)
      return gameConfigValidator.parse({})
    }
  }

  /**
   * Update the game configuration in the database.
   * PHASE 1: Not implemented (read-only). Throws an error.
   */
  updateGameConfig(
    _patch: Partial<GameConfig>,
    _expectedVersion?: number,
  ): GameConfig {
    throw new Error(
      "PostgresRepository.updateGameConfig not yet implemented (PHASE 2)",
    )
  }

  /**
   * Get the manager password from the database.
   * Falls back to env var or DEFAULT_MANAGER_PASSWORD if DB is empty/unreachable.
   */
  async getManagerPassword(): Promise<string> {
    try {
      const result = await this.pool.query(
        `SELECT manager_password FROM games_config WHERE id = $1`,
        ["default"],
      )

      if (result.rows.length > 0 && result.rows[0].manager_password) {
        return result.rows[0].manager_password
      }

      // Fallback to env var
      const envPassword = process.env.MANAGER_PASSWORD
      if (envPassword) {
        console.warn(
          "PostgresRepository: manager_password not in DB, using env var",
        )
        return envPassword
      }

      console.warn(
        "PostgresRepository: manager_password not in DB or env, using default",
      )
      return DEFAULT_MANAGER_PASSWORD
    } catch (error) {
      console.error("PostgresRepository: failed to read manager password", error)
      const envPassword = process.env.MANAGER_PASSWORD
      if (envPassword) {
        return envPassword
      }
      return DEFAULT_MANAGER_PASSWORD
    }
  }

  /**
   * Close the database connection pool.
   * Call this during graceful shutdown.
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
    }
  }
}
