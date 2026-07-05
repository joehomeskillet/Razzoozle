import type { StorageRepository } from "./storage-repository"
import type { FileSystemRepository } from "./filesystem-repository"
import type { PostgresRepository } from "./postgres-repository"
import type { GameConfig } from "@razzoozle/common/validators/game-config"

/**
 * DualWriteRepository writes game config to BOTH filesystem and Postgres.
 * Reads always come from the filesystem (source of truth during dual-write).
 *
 * Used when DATABASE_MODE is 'dual'. If the Postgres write fails after FS
 * succeeds, the error is logged but not propagated — FS remains authoritative.
 */
export class DualWriteRepository implements StorageRepository {
  constructor(
    private readonly fs: FileSystemRepository,
    private readonly pg: PostgresRepository,
  ) {}

  async getGameConfig(): Promise<GameConfig> {
    return this.fs.getGameConfig()
  }

  async getManagerPassword(): Promise<string> {
    return this.fs.getManagerPassword()
  }

  async updateGameConfig(
    patch: Partial<GameConfig>,
    expectedVersion?: number,
  ): Promise<GameConfig> {
    const fsResult = await this.fs.updateGameConfig(patch)

    try {
      await this.pg.updateGameConfig(patch, expectedVersion)
    } catch (error) {
      console.error("DB write failed after FS write succeeded...", error)
    }

    return fsResult
  }
}