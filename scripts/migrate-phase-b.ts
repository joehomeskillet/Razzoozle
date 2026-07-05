/**
 * Migration Phase B: Dependent tables (game_results, submissions, solo_results, catalog, assignments)
 */

import * as path from 'path'
import { Pool } from 'pg'
import { getConfigPath, readJsonFile, listJsonFiles, logStat, isDryRun } from './migrate-utils'

export async function migrateGameResults(pool: Pool | null): Promise<void> {
  console.log('\n[Phase B] Migrating game_results...')

  const configPath = getConfigPath()
  const resultsDir = path.join(configPath, 'results')
  const resultFiles = listJsonFiles(resultsDir)
  const dryRun = isDryRun()

  let updated = 0
  let errors = 0

  for (const filePath of resultFiles) {
    const resultData = await readJsonFile<any>(filePath)
    if (!resultData) {
      errors++
      continue
    }

    const id = path.basename(filePath, '.json')
    const quizId = resultData.quiz_id || resultData.quizzId || null
    const subject = resultData.subject || ''
    const date = resultData.date || new Date().toISOString()
    const players = resultData.players || []
    const version = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO game_results (id, quiz_id, subject, date, players, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          quiz_id = $2,
          subject = $3,
          date = $4,
          players = $5,
          version = $6,
          updated_at = NOW()
        WHERE game_results.id = $1
      `
      try {
        await pool.query(query, [id, quizId, subject, date, JSON.stringify(players), version])
        updated++
      } catch (error) {
        console.error(`  Error migrating game result ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ game_results: ${dryRun ? `[dry-run] would process ${resultFiles.length} files` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('B', 'game_results', 0, updated, 0, errors)
}

export async function migrateSubmissions(pool: Pool | null): Promise<void> {
  console.log('\n[Phase B] Migrating submissions...')

  const configPath = getConfigPath()
  const submissionsDir = path.join(configPath, 'submissions')
  const submissionFiles = listJsonFiles(submissionsDir)
  const dryRun = isDryRun()

  let updated = 0
  let errors = 0

  for (const filePath of submissionFiles) {
    const submissionData = await readJsonFile<any>(filePath)
    if (!submissionData) {
      errors++
      continue
    }

    const id = path.basename(filePath, '.json')
    const quizId = submissionData.quiz_id || submissionData.quizzId || null
    const status = submissionData.status || 'pending'
    const submittedBy = submissionData.submitted_by || submissionData.submittedBy || ''
    const submittedAt = submissionData.submitted_at || submissionData.submittedAt || new Date().toISOString()
    const question = submissionData.question || {}
    const source = submissionData.source || 'upload'
    const version = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO submissions (id, quiz_id, status, submitted_by, submitted_at, question, source, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          quiz_id = $2,
          status = $3,
          submitted_by = $4,
          submitted_at = $5,
          question = $6,
          source = $7,
          version = $8,
          updated_at = NOW()
        WHERE submissions.id = $1
      `
      try {
        await pool.query(query, [
          id,
          quizId,
          status,
          submittedBy,
          submittedAt,
          JSON.stringify(question),
          source,
          version,
        ])
        updated++
      } catch (error) {
        console.error(`  Error migrating submission ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ submissions: ${dryRun ? `[dry-run] would process ${submissionFiles.length} files` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('B', 'submissions', 0, updated, 0, errors)
}

export async function migrateSoloResults(pool: Pool | null): Promise<void> {
  console.log('\n[Phase B] Migrating solo_results...')

  const configPath = getConfigPath()
  const soloDir = path.join(configPath, 'solo-results')
  const soloFiles = listJsonFiles(soloDir)
  const dryRun = isDryRun()

  let updated = 0
  let errors = 0

  // Orphan handling: a solo-result file whose quiz was deleted keeps its rows with
  // quiz_id=null (FK is ON DELETE SET NULL) instead of failing the whole migration.
  const knownQuizIds = new Set<string>()
  if (pool) {
    const qr = await pool.query('SELECT id FROM quizzes')
    for (const row of qr.rows) knownQuizIds.add(row.id)
  }

  for (const filePath of soloFiles) {
    const soloData = await readJsonFile<any>(filePath)
    if (!soloData) {
      errors++
      continue
    }

    // solo-result files are ARRAYS of results, keyed by filename = quiz id.
    const rawQuizId = path.basename(filePath, '.json')
    const quizId = knownQuizIds.has(rawQuizId) ? rawQuizId : null
    const entries = Array.isArray(soloData) ? soloData : [soloData]

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] || {}
      const id = `${quizId}-${i}`
      const playerName = entry.player_name || entry.playerName || 'Anonymous'
      const score = entry.score || 0
      const answeredAt = entry.answered_at || entry.answeredAt || new Date().toISOString()
      const answers = entry.answers || []
      const version = 1

      if (!dryRun && pool) {
        const query = `
        INSERT INTO solo_results (id, quiz_id, player_name, score, answered_at, answers, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          quiz_id = $2,
          player_name = $3,
          score = $4,
          answered_at = $5,
          answers = $6,
          version = $7,
          updated_at = NOW()
        WHERE solo_results.id = $1
      `
        try {
          await pool.query(query, [id, quizId, playerName, score, answeredAt, JSON.stringify(answers), version])
          updated++
        } catch (error) {
          console.error(`  Error migrating solo result ${id}:`, error)
          errors++
        }
      } else {
        updated++
      }
    }
  }

  console.log(
    `  ✓ solo_results: ${dryRun ? `[dry-run] would process ${soloFiles.length} files` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('B', 'solo_results', 0, updated, 0, errors)
}

export async function migrateCatalog(pool: Pool | null): Promise<void> {
  console.log('\n[Phase B] Migrating catalog_entries...')

  const configPath = getConfigPath()
  const catalogDir = path.join(configPath, 'catalog')
  const catalogFiles = listJsonFiles(catalogDir)
  const dryRun = isDryRun()

  let updated = 0
  let errors = 0

  for (const filePath of catalogFiles) {
    const catalogData = await readJsonFile<any>(filePath)
    if (!catalogData) {
      errors++
      continue
    }

    const id = path.basename(filePath, '.json')
    const question = catalogData.question || {}
    const tags = catalogData.tags || []
    const source = catalogData.source || 'upload'
    const addedAt = catalogData.added_at || catalogData.addedAt || new Date().toISOString()
    const version = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO catalog_entries (id, question, tags, source, added_at, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          question = $2,
          tags = $3,
          source = $4,
          added_at = $5,
          version = $6,
          updated_at = NOW()
        WHERE catalog_entries.id = $1
      `
      try {
        await pool.query(query, [id, JSON.stringify(question), JSON.stringify(tags), source, addedAt, version])
        updated++
      } catch (error) {
        console.error(`  Error migrating catalog entry ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ catalog_entries: ${dryRun ? `[dry-run] would process ${catalogFiles.length} files` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('B', 'catalog_entries', 0, updated, 0, errors)
}

export async function migrateAssignments(pool: Pool | null): Promise<void> {
  console.log('\n[Phase B] Migrating assignments...')

  const configPath = getConfigPath()
  const assignmentsDir = path.join(configPath, 'assignments')
  const assignmentFiles = listJsonFiles(assignmentsDir)
  const dryRun = isDryRun()

  let updated = 0
  let errors = 0

  for (const filePath of assignmentFiles) {
    const assignmentData = await readJsonFile<any>(filePath)
    if (!assignmentData) {
      errors++
      continue
    }

    const id = path.basename(filePath, '.json')
    const quizId = assignmentData.quiz_id || assignmentData.quizzId || null
    const assignedTo = assignmentData.assigned_to || assignmentData.assignedTo || ''
    const assignedAt = assignmentData.assigned_at || assignmentData.assignedAt || new Date().toISOString()
    const metadata = assignmentData.metadata || {}
    const version = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO assignments (id, quiz_id, assigned_to, assigned_at, metadata, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          quiz_id = $2,
          assigned_to = $3,
          assigned_at = $4,
          metadata = $5,
          version = $6,
          updated_at = NOW()
        WHERE assignments.id = $1
      `
      try {
        await pool.query(query, [id, quizId, assignedTo, assignedAt, JSON.stringify(metadata), version])
        updated++
      } catch (error) {
        console.error(`  Error migrating assignment ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ assignments: ${dryRun ? `[dry-run] would process ${assignmentFiles.length} files` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('B', 'assignments', 0, updated, 0, errors)
}
