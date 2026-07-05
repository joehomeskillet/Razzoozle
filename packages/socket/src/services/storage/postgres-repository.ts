import type { StorageRepository } from "./storage-repository"
import type { GameConfig } from "@razzoozle/common/validators/game-config"
import { gameConfigValidator } from "@razzoozle/common/validators/game-config"
import { DEFAULT_MANAGER_PASSWORD } from "@razzoozle/common/constants"

// Lazy-load pg so it is only required when DATABASE_MODE=pg.
let Pool: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Pool = require("pg").Pool
} catch {
  // pg not installed — PostgresRepository will throw at construction.
}

/**
 * PostgresRepository implements StorageRepository against the shared Postgres
 * database (games_config is a single row keyed id=1). Natively async — every
 * read hits the DB, so it always reflects the current row (no stale cache).
 *
 * Used when DATABASE_MODE is 'pg' or 'pg-only'. Phase 1 is read-only for config;
 * updateGameConfig is added in Phase 2 (dual-write).
 */
export class PostgresRepository implements StorageRepository {
  private pool: any

  constructor(databaseUrl: string) {
    if (!Pool) {
      throw new Error("pg package not installed. Install with: pnpm add pg")
    }
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }

  async getGameConfig(): Promise<GameConfig> {
    try {
      const result = await this.pool.query(
        `SELECT manager_password, team_mode, join_locked, randomize_answers,
                scoring_mode, low_latency_enabled, low_latency_config
         FROM games_config WHERE id = 1`,
      )
      if (result.rows.length === 0) {
        return gameConfigValidator.parse({})
      }
      const row = result.rows[0]
      const gameConfig: GameConfig = {
        managerPassword: row.manager_password || DEFAULT_MANAGER_PASSWORD,
        teamMode: row.team_mode ?? false,
        joinLocked: row.join_locked ?? false,
        randomizeAnswers: row.randomize_answers ?? false,
        scoringMode: row.scoring_mode ?? "speed",
        lowLatencyMode: {
          enabled: row.low_latency_enabled ?? false,
          ...(row.low_latency_config || {}),
        },
      }
      const validated = gameConfigValidator.safeParse(gameConfig)
      return validated.success ? validated.data : gameConfigValidator.parse({})
    } catch (error) {
      console.error("PostgresRepository.getGameConfig failed", error)
      return gameConfigValidator.parse({})
    }
  }

  async updateGameConfig(
    _patch: Partial<GameConfig>,
    _expectedVersion?: number,
  ): Promise<GameConfig> {
    throw new Error(
      "PostgresRepository.updateGameConfig not yet implemented (Phase 2 dual-write)",
    )
  }

  async getManagerPassword(): Promise<string> {
    try {
      const result = await this.pool.query(
        `SELECT manager_password FROM games_config WHERE id = 1`,
      )
      if (result.rows.length > 0 && result.rows[0].manager_password) {
        return result.rows[0].manager_password
      }
    } catch (error) {
      console.error("PostgresRepository.getManagerPassword failed", error)
    }
    return process.env.MANAGER_PASSWORD || DEFAULT_MANAGER_PASSWORD
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
    }
  }
}
