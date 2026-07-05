import type { StorageRepository } from "./storage-repository"
import { FileSystemRepository } from "./filesystem-repository"
import { PostgresRepository } from "./postgres-repository"
import { DualWriteRepository } from "./dual-write-repository"

/**
 * storageRepository() returns a singleton StorageRepository instance based on
 * the DATABASE_MODE environment variable.
 *
 * - DATABASE_MODE unset or 'file': FileSystemRepository (reads/writes game.json)
 * - DATABASE_MODE 'dual': DualWriteRepository (reads FS, writes FS then DB)
 * - DATABASE_MODE 'pg' or 'pg-only': PostgresRepository (reads/writes Postgres)
 *
 * The instance is lazy-initialized on first call to ensure DATABASE_URL is
 * available when a DB-backed mode is selected.
 */

let instance: StorageRepository | null = null

export function storageRepository(): StorageRepository {
  if (instance) {
    return instance
  }

  const databaseMode = process.env.DATABASE_MODE?.toLowerCase() || "file"

  if (databaseMode === "dual") {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      console.warn(
        "DATABASE_MODE is set to dual but DATABASE_URL is not configured. Falling back to FileSystemRepository.",
      )
      instance = new FileSystemRepository()
    } else {
      try {
        instance = new DualWriteRepository(
          new FileSystemRepository(),
          new PostgresRepository(databaseUrl),
        )
        console.log("Initialized DualWriteRepository")
      } catch (error) {
        console.error(
          "Failed to initialize DualWriteRepository, falling back to FileSystemRepository:",
          error,
        )
        instance = new FileSystemRepository()
      }
    }
  } else if (databaseMode === "pg" || databaseMode === "pg-only") {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      console.error(
        "DATABASE_MODE is set to postgres but DATABASE_URL is not configured. Falling back to FileSystemRepository.",
      )
      instance = new FileSystemRepository()
    } else {
      try {
        instance = new PostgresRepository(databaseUrl)
        console.log("Initialized PostgresRepository")
      } catch (error) {
        console.error(
          "Failed to initialize PostgresRepository, falling back to FileSystemRepository:",
          error,
        )
        instance = new FileSystemRepository()
      }
    }
  } else {
    instance = new FileSystemRepository()
  }

  return instance
}

/**
 * Reset the singleton instance (useful for testing).
 */
export function resetStorageRepository(): void {
  instance = null
}
