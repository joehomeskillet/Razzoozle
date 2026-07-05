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

const mergeGameConfigPatch = (
  current: GameConfig,
  patch: Partial<GameConfig>,
): GameConfig => {
  const { lowLatencyMode, ...flatPatch } = patch

  return {
    ...current,
    ...flatPatch,
    ...(lowLatencyMode === undefined
      ? {}
      : {
          lowLatencyMode: { ...current.lowLatencyMode, ...lowLatencyMode },
        }),
  }
}

const rowToGameConfig = (row: Record<string, unknown>): GameConfig => {
  const candidate = {
    managerPassword:
      (row.manager_password as string | null) || DEFAULT_MANAGER_PASSWORD,
    teamMode: (row.team_mode as boolean | null) ?? false,
    joinLocked: (row.join_locked as boolean | null) ?? false,
    randomizeAnswers: (row.randomize_answers as boolean | null) ?? false,
    scoringMode: (row.scoring_mode as "speed" | "accuracy" | null) ?? "speed",
    lowLatencyMode: {
      enabled: (row.low_latency_enabled as boolean | null) ?? false,
      ...((row.low_latency_config as object | null) || {}),
    },
  }
  const validated = gameConfigValidator.safeParse(candidate)
  return validated.success ? validated.data : gameConfigValidator.parse({})
}

/**
 * PostgresRepository implements StorageRepository against the shared Postgres
 * database (games_config is a single row keyed id=1). Natively async — every
 * read hits the DB, so it always reflects the current row (no stale cache).
 *
 * Used when DATABASE_MODE is 'pg' or 'pg-only', or as the DB leg of dual-write.
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
      return rowToGameConfig(result.rows[0])
    } catch (error) {
      console.error("PostgresRepository.getGameConfig failed", error)
      return gameConfigValidator.parse({})
    }
  }

  async updateGameConfig(
    patch: Partial<GameConfig>,
    expectedVersion?: number,
  ): Promise<GameConfig> {
    try {
      const current = await this.getGameConfig()
      const merged = mergeGameConfigPatch(current, patch)
      const validated = gameConfigValidator.safeParse(merged)

      if (!validated.success) {
        throw new Error(validated.error.issues[0].message)
      }

      const config = validated.data
      const params: unknown[] = [
        config.managerPassword,
        config.teamMode,
        config.joinLocked ?? false,
        config.randomizeAnswers ?? false,
        config.scoringMode ?? "speed",
        config.lowLatencyMode.enabled,
        JSON.stringify(config.lowLatencyMode),
      ]

      let query = `
        UPDATE games_config SET
          manager_password = $1,
          team_mode = $2,
          join_locked = $3,
          randomize_answers = $4,
          scoring_mode = $5,
          low_latency_enabled = $6,
          low_latency_config = $7,
          version = version + 1,
          updated_at = NOW()
        WHERE id = 1`

      if (expectedVersion !== undefined) {
        params.push(expectedVersion)
        query += ` AND version = $${params.length}`
      }

      query += `
        RETURNING manager_password, team_mode, join_locked, randomize_answers,
                  scoring_mode, low_latency_enabled, low_latency_config,
                  version, created_at, updated_at`

      const result = await this.pool.query(query, params)

      if (result.rows.length === 0) {
        if (expectedVersion !== undefined) {
          throw new Error(
            "Version mismatch: config was modified concurrently",
          )
        }
        throw new Error("games_config row not found")
      }

      return rowToGameConfig(result.rows[0])
    } catch (error) {
      console.error("PostgresRepository.updateGameConfig failed", error)
      throw error
    }
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
