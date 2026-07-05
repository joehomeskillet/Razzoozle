import type { StorageRepository } from "./storage-repository"
import type { GameConfig } from "@razzoozle/common/validators/game-config"
import {
  getGameConfig as getGameConfigFromDisk,
  updateGameConfig as updateGameConfigOnDisk,
} from "@razzoozle/socket/services/config"

/**
 * FileSystemRepository implements StorageRepository by delegating to the
 * existing file-based functions in config.ts. This is the default and ensures
 * zero behavioral change when DATABASE_MODE is unset or set to 'file'.
 *
 * PHASE 1: This is a thin wrapper around the existing config.ts module.
 * It reads/writes game.json from the filesystem without any new logic.
 */
export class FileSystemRepository implements StorageRepository {
  getGameConfig(): GameConfig {
    return getGameConfigFromDisk()
  }

  updateGameConfig(patch: Partial<GameConfig>, _expectedVersion?: number): GameConfig {
    // Delegate to the existing updateGameConfig from config.ts
    // Note: expectedVersion is ignored in Phase 1 (no optimistic locking on files)
    return updateGameConfigOnDisk(patch)
  }

  getManagerPassword(): string {
    // Read the current game config and extract the manager password
    const config = this.getGameConfig()
    return config.managerPassword
  }
}
