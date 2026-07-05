/**
 * Migration Phase C: Metadata tables (achievements_config, media_assets, installed_plugins)
 */

import * as path from 'path'
import { Pool } from 'pg'
import { getConfigPath, readJsonFile, logStat, isDryRun } from './migrate-utils'

export async function migrateAchievementsConfig(pool: Pool | null): Promise<void> {
  console.log('\n[Phase C] Migrating achievements_config...')

  const configPath = getConfigPath()
  const achievementsPath = path.join(configPath, 'achievements.json')
  const achievementsData = await readJsonFile<any>(achievementsPath)
  const dryRun = isDryRun()

  if (!achievementsData || Object.keys(achievementsData).length === 0) {
    console.log('  No achievements.json found or empty, skipping')
    await logStat('C', 'achievements_config', 0, 0, 1, 0)
    return
  }

  let updated = 0
  let errors = 0

  for (const [key, value] of Object.entries(achievementsData)) {
    const id = key
    const enabled = (value as any)?.enabled ?? true
    const name = (value as any)?.name || key
    const description = (value as any)?.description || ''
    const threshold = (value as any)?.threshold || 0
    const version = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO achievements_config (id, enabled, name, description, threshold, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          enabled = $2,
          name = $3,
          description = $4,
          threshold = $5,
          version = $6,
          updated_at = NOW()
        WHERE achievements_config.id = $1
      `
      try {
        await pool.query(query, [id, enabled, name, description, threshold, version])
        updated++
      } catch (error) {
        console.error(`  Error migrating achievement ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ achievements_config: ${dryRun ? `[dry-run] would process ${Object.keys(achievementsData).length} entries` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('C', 'achievements_config', 0, updated, 0, errors)
}

export async function migrateMediaAssets(pool: Pool | null): Promise<void> {
  console.log('\n[Phase C] Migrating media_assets...')

  const configPath = getConfigPath()
  const mediaManifestPath = path.join(configPath, 'media-manifest.json')
  const mediaData = await readJsonFile<any>(mediaManifestPath)
  const dryRun = isDryRun()

  if (!mediaData || Object.keys(mediaData).length === 0) {
    console.log('  No media-manifest.json found or empty, skipping')
    await logStat('C', 'media_assets', 0, 0, 1, 0)
    return
  }

  let updated = 0
  let errors = 0

  for (const [key, value] of Object.entries(mediaData)) {
    const id = key
    const filename = (value as any)?.filename || key
    const url = (value as any)?.url || ''
    const size = (value as any)?.size || 0
    const type = (value as any)?.type || 'image'
    const category = (value as any)?.category || 'general'
    const source = (value as any)?.source || 'upload'
    const width = (value as any)?.width || null
    const height = (value as any)?.height || null
    const uploadedAt = (value as any)?.uploaded_at || (value as any)?.uploadedAt || new Date().toISOString()

    if (!dryRun && pool) {
      const query = `
        INSERT INTO media_assets (id, filename, url, size, type, category, source, width, height, uploaded_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          filename = $2,
          url = $3,
          size = $4,
          type = $5,
          category = $6,
          source = $7,
          width = $8,
          height = $9,
          uploaded_at = $10,
          updated_at = NOW()
        WHERE media_assets.id = $1
      `
      try {
        await pool.query(query, [id, filename, url, size, type, category, source, width, height, uploadedAt])
        updated++
      } catch (error) {
        console.error(`  Error migrating media asset ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ media_assets: ${dryRun ? `[dry-run] would process ${Object.keys(mediaData).length} entries` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('C', 'media_assets', 0, updated, 0, errors)
}

export async function migrateInstalledPlugins(pool: Pool | null): Promise<void> {
  console.log('\n[Phase C] Migrating installed_plugins...')

  const configPath = getConfigPath()
  const pluginsPath = path.join(configPath, 'plugins', 'index.json')
  const pluginsData = await readJsonFile<any[]>(pluginsPath)
  const dryRun = isDryRun()

  if (!pluginsData || pluginsData.length === 0) {
    console.log('  No plugins/index.json found or empty, skipping')
    await logStat('C', 'installed_plugins', 0, 0, 1, 0)
    return
  }

  let updated = 0
  let errors = 0

  for (const plugin of pluginsData) {
    const id = plugin.id || ''
    const name = plugin.name || ''
    const version = plugin.version || '1.0.0'
    const enabled = plugin.enabled ?? true
    const capabilities = plugin.capabilities || []
    const config = plugin.config || {}
    const pluginVersion = 1

    if (!dryRun && pool) {
      const query = `
        INSERT INTO installed_plugins (id, name, version, enabled, capabilities, config, plugin_version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = $2,
          version = $3,
          enabled = $4,
          capabilities = $5,
          config = $6,
          plugin_version = $7,
          updated_at = NOW()
        WHERE installed_plugins.id = $1
      `
      try {
        await pool.query(query, [
          id,
          name,
          version,
          enabled,
          JSON.stringify(capabilities),
          JSON.stringify(config),
          pluginVersion,
        ])
        updated++
      } catch (error) {
        console.error(`  Error migrating plugin ${id}:`, error)
        errors++
      }
    } else {
      updated++
    }
  }

  console.log(
    `  ✓ installed_plugins: ${dryRun ? `[dry-run] would process ${pluginsData.length} entries` : `inserted/updated ${updated} rows, errors: ${errors}`}`,
  )
  await logStat('C', 'installed_plugins', 0, updated, 0, errors)
}
