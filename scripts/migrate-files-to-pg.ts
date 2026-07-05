#!/usr/bin/env node
/**
 * One-time backfill migration: File-based /config → Postgres
 *
 * IMPORTANT: Before running this script, create a backup of your config directory:
 *   tar -czf config-backup.tgz config/
 *
 * This script performs a 3-phase idempotent migration from the file-based
 * /config directory structure to a PostgreSQL database.
 *
 * Environment variables:
 *   CONFIG_PATH: Path to config directory (default: ./config)
 *   DATABASE_URL: Postgres connection string (required)
 *
 * Usage:
 *   npx ts-node scripts/migrate-files-to-pg.ts [--dry-run]
 *
 * Phases:
 *   A: Parent tables (games_config, quizzes, themes)
 *   B: Dependent tables (game_results, submissions, catalog_entries, solo_results, assignments)
 *   C: Metadata tables (media_assets, achievements_config, installed_plugins)
 *
 * Deduplication & Idempotency:
 *   All tables use ON CONFLICT ... DO UPDATE for idempotent upserts.
 *   Key dedup fields per plan:
 *   - game_results: id (primary key)
 *   - submissions: id (primary key, uuid)
 *   - solo_results: id (primary key)
 *   - All others: id (primary key)
 *
 * Rollback:
 *   If migration fails mid-run, operator can re-run the script (idempotent).
 *   Or restore from tar backup and drop schema: DROP SCHEMA public CASCADE;
 */

import * as fs from 'fs'
import { Pool } from 'pg'
import { printHeader, printPhaseHeader, printSummary, connectDb, getConfigPath, isDryRun } from './migrate-utils'
import { migrateGameConfig, migrateQuizzes, migrateThemes } from './migrate-phase-a'
import { migrateGameResults, migrateSubmissions, migrateSoloResults, migrateCatalog, migrateAssignments } from './migrate-phase-b'
import { migrateAchievementsConfig, migrateMediaAssets, migrateInstalledPlugins } from './migrate-phase-c'

async function main(): Promise<void> {
  let pool: Pool | null = null
  const dryRun = isDryRun()
  const configPath = getConfigPath()

  printHeader()

  if (!dryRun) {
    try {
      pool = await connectDb()
      console.log('✓ Connected to Postgres')
    } catch (error) {
      console.error('✗ Failed to connect to Postgres:', error)
      process.exit(1)
    }
  } else {
    console.log('[DRY-RUN] Skipping database connection')
  }

  try {
    // Verify config directory exists
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config directory not found: ${configPath}`)
    }

    // =========================================================================
    // PHASE A: Parent Tables
    // =========================================================================
    printPhaseHeader('A', 'Parent Tables')

    await migrateGameConfig(pool)
    await migrateQuizzes(pool)
    await migrateThemes(pool)

    // =========================================================================
    // PHASE B: Dependent Tables
    // =========================================================================
    printPhaseHeader('B', 'Dependent Tables')

    await migrateGameResults(pool)
    await migrateSubmissions(pool)
    await migrateSoloResults(pool)
    await migrateCatalog(pool)
    await migrateAssignments(pool)

    // =========================================================================
    // PHASE C: Metadata Tables
    // =========================================================================
    printPhaseHeader('C', 'Metadata Tables')

    await migrateAchievementsConfig(pool)
    await migrateMediaAssets(pool)
    await migrateInstalledPlugins(pool)

    // =========================================================================
    // Summary
    // =========================================================================
    printSummary()

    process.exit(0)
  } catch (error) {
    console.error('\n✗ Migration failed:', error)
    process.exit(1)
  } finally {
    if (pool) {
      await pool.end()
    }
  }
}

main()
