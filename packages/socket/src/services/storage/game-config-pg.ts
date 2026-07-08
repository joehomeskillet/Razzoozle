import type { GameConfig } from "@razzoozle/common/validators/game-config"
import { storageRepository } from "@razzoozle/socket/services/storage"

// Game config has no dedicated *-pg.ts pool of its own — the async Postgres
// read already exists via storageRepository().getGameConfig() (see
// postgres-repository.ts:71 / storage-repository.ts:18). This module just
// wraps it under the same `getXPg()` naming convention the other storage/*-pg
// modules use, so services/storage/config-read.ts can route to it uniformly.
export const getGameConfigPg = async (): Promise<GameConfig> =>
  storageRepository().getGameConfig()
