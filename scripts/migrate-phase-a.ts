/**
 * Migration Phase A: Parent tables (games_config, quizzes, themes)
 */

import * as path from 'path'
import { Pool } from 'pg'
import { getConfigPath, readJsonFile, listJsonFiles, logStat, isDryRun } from './migrate-utils'

export async function migrateGameConfig(pool: Pool | null): Promise<void> {
  console.log('\n[Phase A] Migrating games_config...')

  const configPath = getConfigPath()
  const gameJsonPath = path.join(configPath, 'game.json')
  const gameData = await readJsonFile<any>(gameJsonPath)
  const dryRun = isDryRun()

  if (!gameData) {
    console.log('  No game.json found, skipping')
    await logStat('A', 'games_config', 0, 0, 1, 0)
    return
  }

  const id = 'default'
  const managerPassword = gameData.managerPassword || 'PASSWORD'
  const teamMode = gameData.teamMode || false
  const joinLocked = gameData.joinLocked || false
  const randomizeAnswers = gameData.randomizeAnswers || false
  const scoringMode = gameData.scoringMode || 'speed'
  const lowLatencyEnabled = gameData.lowLatencyMode?.enabled || false
  const lowLatencyConfig = gameData.lowLatencyMode || {}
  const version = 1

  if (!dryRun && pool) {
    const query = `
      INSERT INTO games_config
      (id, manager_password, team_mode, join_locked, randomize_answers, scoring_mode,
       low_latency_enabled, low_latency_config, version, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        manager_password = $2,
        team_mode = $3,
        join_locked = $4,
        randomize_answers = $5,
        scoring_mode = $6,
        low_latency_enabled = $7,
        low_latency_config = $8,
        version = $9,
        updated_at = NOW()
      WHERE games_config.id = $1
    `
    await pool.query(query, [
      id,
      managerPassword,
      teamMode,
      joinLocked,
      randomizeAnswers,
      scoringMode,
      lowLatencyEnabled,
      JSON.stringify(lowLatencyConfig),
      version,
    ])
  }

  console.log(`  ✓ games_config: ${dryRun ? '[dry-run] would insert/upsert 1 row' : 'inserted/upserted 1 row'}`)
  await logStat('A', 'games_config', dryRun ? 0 : 1, dryRun ? 0 : 1, 0, 0)
}

export async function migrateQuizzes(pool: Pool | null): Promise<void> {
  console.log('\n[Phase A] Migrating quizzes...')

  const configPath = getConfigPath()
  const quizzDir = path.join(configPath, 'quizz')
  const quizzFiles = listJsonFiles(quizzDir)
  const dryRun = isDryRun()

  let updated = 0
  let errors = 0

  for (const filePath of quizzFiles) {
    const quizzData = await readJsonFile<any>(filePath)
    if (!quizzData) {
      errors++
      continue
    }

    const id = path.basename(filePath, '.json')
    const subject = quizzData.subject || 'Unnamed Quiz'
    const questions = quizzData.questions || []
    const archived = quizzData.archived || false
    const version = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO quizzes (id, subject, questions, archived, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          subject = $2,
          questions = $3,
          archived = $4,
          version = $5,
          updated_at = NOW()
        WHERE quizzes.id = $1
      `
      try {
        await pool.query(query, [id, subject, JSON.stringify(questions), archived, version])
        updated++
      } catch (error) {
        console.error(`  Error migrating quiz ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ quizzes: ${dryRun ? `[dry-run] would process ${quizzFiles.length} files` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('A', 'quizzes', 0, updated, 0, errors)
}

export async function migrateThemes(pool: Pool | null): Promise<void> {
  console.log('\n[Phase A] Migrating themes...')

  const configPath = getConfigPath()
  const themesDir = path.join(configPath, 'theme-templates')
  const themeFiles = listJsonFiles(themesDir)
  const dryRun = isDryRun()

  let updated = 0
  let errors = 0

  for (const filePath of themeFiles) {
    const themeData = await readJsonFile<any>(filePath)
    if (!themeData) {
      errors++
      continue
    }

    const id = themeData.id || path.basename(filePath, '.json')
    const name = themeData.name || 'Unnamed Theme'
    const theme = themeData.theme || {}
    const version = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO themes (id, name, theme, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = $2,
          theme = $3,
          version = $4,
          updated_at = NOW()
        WHERE themes.id = $1
      `
      try {
        await pool.query(query, [id, name, JSON.stringify(theme), version])
        updated++
      } catch (error) {
        console.error(`  Error migrating theme ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ themes: ${dryRun ? `[dry-run] would process ${themeFiles.length} files` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('A', 'themes', 0, updated, 0, errors)
}
