/**
 * Migration utility functions: File I/O, database setup, logging
 */

import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'pg'

export interface MigrationStats {
  phase: 'A' | 'B' | 'C'
  table: string
  inserted: number
  updated: number
  skipped: number
  errors: number
}

const stats: MigrationStats[] = []

export async function connectDb(): Promise<Pool> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const p = new Pool({ connectionString: databaseUrl })
  await p.query('SELECT NOW()') // Verify connection
  return p
}

export function getConfigPath(): string {
  return process.env.CONFIG_PATH || './config'
}

export function isDryRun(): boolean {
  return process.argv.includes('--dry-run')
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    if (!fs.existsSync(filePath)) {
      return null
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
    return null
  }
}

export function listJsonFiles(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath)) {
      return []
    }
    return fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.join(dirPath, file))
  } catch (error) {
    console.error(`Error listing ${dirPath}:`, error)
    return []
  }
}

export async function logStat(
  phase: 'A' | 'B' | 'C',
  table: string,
  inserted: number,
  updated: number,
  skipped: number,
  errors: number,
): Promise<void> {
  stats.push({ phase, table, inserted, updated, skipped, errors })
}

export function getStats(): MigrationStats[] {
  return stats
}

export function printHeader(): void {
  console.log('================================================================================')
  console.log('Razzoozle File-to-Postgres Migration')
  console.log('================================================================================')
  console.log(`Config path: ${getConfigPath()}`)
  console.log(`Database URL: ${process.env.DATABASE_URL ? '***' : 'NOT SET (will fail)'}`)
  console.log(`Mode: ${isDryRun() ? 'DRY-RUN (no writes)' : 'LIVE (will write to DB)'}`)
  console.log('')
  console.log('⚠️  IMPORTANT: Before running in LIVE mode, create a backup:')
  console.log('   tar -czf config-backup.tgz config/')
  console.log('')
}

export function printPhaseHeader(phase: 'A' | 'B' | 'C', title: string): void {
  const borders = '═'.repeat(76)
  console.log(`\n╔${borders}╗`)
  console.log(`║ PHASE ${phase}: ${title.padEnd(70)} ║`)
  console.log(`╚${borders}╝`)
}

export function printSummary(): void {
  const borders = '═'.repeat(76)
  console.log(`\n╔${borders}╗`)
  console.log(`║ ${'Migration Summary'.padEnd(76)} ║`)
  console.log(`╚${borders}╝`)

  const totalInserted = stats.reduce((sum, s) => sum + s.inserted, 0)
  const totalUpdated = stats.reduce((sum, s) => sum + s.updated, 0)
  const totalSkipped = stats.reduce((sum, s) => sum + s.skipped, 0)
  const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0)

  console.table(stats)

  console.log('')
  console.log(`Total inserted: ${totalInserted}`)
  console.log(`Total updated:  ${totalUpdated}`)
  console.log(`Total skipped:  ${totalSkipped}`)
  console.log(`Total errors:   ${totalErrors}`)

  if (isDryRun()) {
    console.log('\n✓ Dry-run completed successfully. No data was written.')
    console.log('  To run in live mode, execute without --dry-run flag.')
  } else {
    console.log('\n✓ Migration completed successfully!')
    console.log('  Verify data in Postgres and then proceed with deployment.')
  }

  if (totalErrors > 0) {
    console.log(`\n⚠️  ${totalErrors} error(s) occurred. Review the logs above.`)
  }
}
