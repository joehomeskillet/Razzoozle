import type { StorageRepository } from "./storage-repository"
import type { GameConfig } from "@razzoozle/common/validators/game-config"
import {
  getGameConfig as getGameConfigFromDisk,
  updateGameConfig as updateGameConfigOnDisk,
} from "@razzoozle/socket/services/config"

/**
 * FileSystemRepository implements StorageRepository by delegating to the
 * existing file-based functions in config.ts. This is the default and ensures
 * ZERO behavioral change when DATABASE_MODE is unset or 'file'.
 *
 * The underlying config.ts functions are synchronous (game.json reads/writes);
 * the async methods here simply wrap them in resolved Promises.
 */
export class FileSystemRepository implements StorageRepository {
  async getGameConfig(): Promise<GameConfig> {
    return getGameConfigFromDisk()
  }

  async updateGameConfig(
    patch: Partial<GameConfig>,
    _expectedVersion?: number,
  ): Promise<GameConfig> {
    // expectedVersion is ignored on files (no optimistic locking).
    return updateGameConfigOnDisk(patch)
  }

  async getManagerPassword(): Promise<string> {
    const config = await this.getGameConfig()
    return config.managerPassword
  }
}
