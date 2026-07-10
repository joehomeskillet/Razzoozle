use sqlx::PgPool;
use std::fs;
use std::path::Path;

pub async fn create_pool() -> Option<PgPool> {
    match std::env::var("DATABASE_URL") {
        Ok(url) => Some(sqlx::PgPool::connect(&url).await.expect("Failed to connect to DATABASE_URL")),
        Err(_) => None,
    }
}

pub async fn get_manager_password(pool: &Option<PgPool>) -> Option<String> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(Option<String>,)> = sqlx::query_as("SELECT manager_password FROM games_config WHERE id = 1")
        .fetch_optional(pool)
        .await
        .ok()?;

    row.and_then(|(pw,)| pw)
}

/// Load achievements configuration from the database.
/// Returns a vector of serde_json objects with achievement config shape.
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_achievements(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<bool>, Option<String>, Option<String>, Option<i32>, Option<i32>)> =
        match sqlx::query_as(
            "SELECT id, enabled, name, description, threshold, bonus FROM achievements_config ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch achievements_config from database: {}", e);
                return Vec::new();
            }
        };

    let result = rows.into_iter()
        .map(|(id, enabled, name, description, threshold, bonus)| {
            let mut obj = serde_json::json!({"id": id});
            if let Some(e) = enabled {
                obj["enabled"] = serde_json::json!(e);
            }
            if let Some(n) = name {
                obj["name"] = serde_json::json!(n);
            }
            if let Some(d) = description {
                obj["description"] = serde_json::json!(d);
            }
            if let Some(t) = threshold {
                obj["threshold"] = serde_json::json!(t);
            }
            if let Some(b) = bonus {
                obj["bonus"] = serde_json::json!(b);
            }
            obj
        })
        .collect();

    result
}

/// Load installed plugins from the database.
/// Returns a vector of serde_json objects with InstalledPlugin shape (including files jsonb).
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_plugins(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, String, bool, serde_json::Value, Option<serde_json::Value>, Option<serde_json::Value>)> =
        match sqlx::query_as(
            "SELECT id, name, version, enabled, capabilities, config, files FROM installed_plugins ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch installed_plugins from database: {}", e);
                return Vec::new();
            }
        };

    let result = rows.into_iter()
        .map(|(id, name, version, enabled, capabilities, config, files)| {
            let mut obj = serde_json::json!({
                "id": id,
                "name": name,
                "version": version,
                "enabled": enabled,
                "capabilities": capabilities,
            });
            if let Some(cfg) = config {
                obj["config"] = cfg;
            }
            if let Some(f) = files {
                obj["files"] = f;
            }
            obj
        })
        .collect();

    result
}

/// Get plugins for hydration (id, files map) from Postgres.
/// Returns empty vec if pool is None or DB query fails.
async fn get_plugins_for_hydrate(pool: &Option<PgPool>) -> Vec<(String, Option<serde_json::Value>)> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<serde_json::Value>)> =
        match sqlx::query_as(
            "SELECT id, files FROM installed_plugins WHERE files IS NOT NULL ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch installed_plugins for hydration from database: {}", e);
                return Vec::new();
            }
        };

    rows
}

/// Simple base64 decoder (inline, no external dependency)
fn decode_base64(s: &str) -> Result<Vec<u8>, String> {
    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for &byte in s.as_bytes() {
        let val = if byte == b'=' {
            break;
        } else if let Some(pos) = BASE64_CHARS.iter().position(|&b| b == byte) {
            pos as u32
        } else if byte.is_ascii_whitespace() {
            continue;
        } else {
            return Err("Invalid base64 character".to_string());
        };

        buf = (buf << 6) | val;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            result.push(((buf >> bits) & 0xff) as u8);
        }
    }

    Ok(result)
}

/// Boot-hydrate plugins from Postgres to disk.
/// Mirrors Node's hydratePluginsFromPg semantics:
/// - Reads installed_plugins from PG (id, files jsonb)
/// - Writes plugin files to config/plugins/<id>/ (only if missing, idempotent)
/// - Empty-guard: if PG has 0 plugins, do nothing
/// - Path traversal safety: validates relative paths before writing
/// Non-fatal: logs errors but doesn't panic.
pub async fn hydrate_plugins_from_pg(pool: &Option<sqlx::PgPool>, config_base: &str) {
    let all_plugins = get_plugins_for_hydrate(pool).await;

    // Empty-guard: if PG has 0 plugins, do nothing (never nuke existing plugin dirs)
    if all_plugins.is_empty() {
        return;
    }

    let plugins_root = format!("{}/plugins", config_base);

    // Ensure plugins root directory exists
    if let Err(e) = fs::create_dir_all(&plugins_root) {
        eprintln!("Failed to create plugins directory '{}': {}", plugins_root, e);
        return;
    }

    let mut total_plugins = 0;
    let mut total_files = 0;

    // For each plugin, restore files to disk
    for (plugin_id, files_opt) in all_plugins {
        total_plugins += 1;

        let files_map = match files_opt {
            Some(files_val) => {
                if !files_val.is_object() {
                    eprintln!("plugins-pg hydrate: skipping plugin {} — files is not a JSON object", plugin_id);
                    continue;
                }
                files_val
            }
            None => {
                // Plugin has no files (shouldn't happen due to WHERE files IS NOT NULL, but be safe)
                continue;
            }
        };

        let plugin_dir = format!("{}/{}", plugins_root, plugin_id);

        // Ensure plugin directory exists
        if let Err(e) = fs::create_dir_all(&plugin_dir) {
            eprintln!("Failed to create plugin directory '{}': {}", plugin_dir, e);
            continue;
        }

        // Restore each file from base64
        if let Some(obj) = files_map.as_object() {
            for (relpath, base64_val) in obj {
                // Guard against traversal attacks (match Node's exact checks)
                if relpath.starts_with("/")
                    || relpath.starts_with("\\")
                    || relpath.contains("..")
                    || relpath.contains("\0")
                {
                    eprintln!(
                        "plugins-pg hydrate: skipping unsafe relpath in plugin {}: {}",
                        plugin_id, relpath
                    );
                    continue;
                }

                let file_path = format!("{}/{}", plugin_dir, relpath);

                // Only write if missing (idempotent, preserves any on-disk changes)
                if Path::new(&file_path).exists() {
                    continue;
                }

                let base64_str = match base64_val.as_str() {
                    Some(s) => s,
                    None => {
                        eprintln!(
                            "plugins-pg hydrate: skipping file {} in plugin {} — value is not a string",
                            relpath, plugin_id
                        );
                        continue;
                    }
                };

                // Ensure parent directory exists
                if let Some(parent) = Path::new(&file_path).parent() {
                    if let Err(e) = fs::create_dir_all(parent) {
                        eprintln!("Failed to create parent directory for '{}': {}", file_path, e);
                        continue;
                    }
                }

                // Decode base64 and write
                match decode_base64(base64_str) {
                    Ok(bytes) => {
                        match fs::write(&file_path, &bytes) {
                            Ok(_) => total_files += 1,
                            Err(e) => {
                                eprintln!(
                                    "plugins-pg hydrate: failed to write file {} in plugin {}: {}",
                                    relpath, plugin_id, e
                                );
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!(
                            "plugins-pg hydrate: failed to decode base64 for file {} in plugin {}: {}",
                            relpath, plugin_id, e
                        );
                    }
                }
            }
        }
    }

    eprintln!(
        "plugins-pg hydrate: {} plugins, {} files written",
        total_plugins, total_files
    );
}

/// Load game configuration from the database.
/// Returns team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode.
/// Returns None for all fields if pool is None or DB query fails.
pub async fn get_game_config(pool: &Option<PgPool>) -> (Option<bool>, Option<bool>, Option<bool>, Option<bool>, Option<String>) {
    let pool = match pool {
        Some(p) => p,
        None => return (None, None, None, None, None),
    };

    let row: Option<(Option<bool>, Option<bool>, Option<bool>, Option<bool>, Option<String>)> =
        sqlx::query_as(
            "SELECT team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode \
             FROM games_config WHERE id = 1"
        )
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    row.unwrap_or((None, None, None, None, None))
}

/// Update game config with a partial patch. Deep-merges into existing row.
/// Fields: team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode.
/// Only updates fields that are Some; omitted fields (None) are left unchanged.
pub async fn update_game_config(
    pool: &Option<PgPool>,
    patch: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Extract optional fields from the patch
    let team_mode = patch.get("teamMode").and_then(|v| v.as_bool());
    let low_latency_enabled = patch.get("lowLatencyEnabled").and_then(|v| v.as_bool());
    let join_locked = patch.get("joinLocked").and_then(|v| v.as_bool());
    let randomize_answers = patch.get("randomizeAnswers").and_then(|v| v.as_bool());
    let scoring_mode = patch.get("scoringMode").and_then(|v| v.as_str());

    // Build the UPDATE statement dynamically — only touch fields that are present
    let mut query_str = "UPDATE games_config SET ".to_string();
    let mut updates = Vec::new();
    let mut idx = 1;

    if team_mode.is_some() {
        updates.push(format!("team_mode = ${}", idx));
        idx += 1;
    }
    if low_latency_enabled.is_some() {
        updates.push(format!("low_latency_enabled = ${}", idx));
        idx += 1;
    }
    if join_locked.is_some() {
        updates.push(format!("join_locked = ${}", idx));
        idx += 1;
    }
    if randomize_answers.is_some() {
        updates.push(format!("randomize_answers = ${}", idx));
        idx += 1;
    }
    if scoring_mode.is_some() {
        updates.push(format!("scoring_mode = ${}", idx));
        idx += 1;
    }

    if updates.is_empty() {
        // No fields to update — silent no-op (consistent with Node)
        return Ok(());
    }

    updates.push(format!("updated_at = now()"));
    query_str.push_str(&updates.join(", "));
    query_str.push_str(" WHERE id = 1");

    let mut query = sqlx::query(&query_str);

    if let Some(tm) = team_mode {
        query = query.bind(tm);
    }
    if let Some(lle) = low_latency_enabled {
        query = query.bind(lle);
    }
    if let Some(jl) = join_locked {
        query = query.bind(jl);
    }
    if let Some(ra) = randomize_answers {
        query = query.bind(ra);
    }
    if let Some(sm) = scoring_mode {
        query = query.bind(sm);
    }

    query
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Update achievements config with a partial patch. Deep-merges by id.
/// Each key in the patch is an achievement id; the value is a partial override
/// that is merged with the existing record (if any).
pub async fn update_achievements_config(
    pool: &Option<PgPool>,
    patch: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let patch_obj = match patch.as_object() {
        Some(obj) => obj,
        None => return Ok(()), // Non-object patch is a silent no-op
    };

    // Iterate over each achievement id in the patch
    for (id, override_val) in patch_obj {
        let enabled = override_val.get("enabled").and_then(|v| v.as_bool());
        let name = override_val.get("name").and_then(|v| v.as_str());
        let description = override_val.get("description").and_then(|v| v.as_str());
        let threshold = override_val.get("threshold").and_then(|v| v.as_i64()).map(|v| v as i32);
        let bonus = override_val.get("bonus").and_then(|v| v.as_i64()).map(|v| v as i32);

        // UPSERT: if the row exists, update only the non-None fields; if it doesn't, insert
        sqlx::query(
            "INSERT INTO achievements_config (id, enabled, name, description, threshold, bonus) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             ON CONFLICT (id) DO UPDATE SET \
                enabled = COALESCE(EXCLUDED.enabled, achievements_config.enabled), \
                name = COALESCE(EXCLUDED.name, achievements_config.name), \
                description = COALESCE(EXCLUDED.description, achievements_config.description), \
                threshold = COALESCE(EXCLUDED.threshold, achievements_config.threshold), \
                bonus = COALESCE(EXCLUDED.bonus, achievements_config.bonus)"
        )
        .bind(id)
        .bind(enabled)
        .bind(name)
        .bind(description)
        .bind(threshold)
        .bind(bonus)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Upsert an installed plugin into the database with metadata and files jsonb.
/// Performs INSERT ... ON CONFLICT (id) DO UPDATE to keep metadata and files in sync.
/// The `files` parameter should be a JSON object mapping relative paths to base64-encoded content.
pub async fn upsert_installed_plugin(
    pool: &Option<PgPool>,
    plugin: &razzoozle_protocol::manager::InstalledPlugin,
    files: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let capabilities_json = serde_json::to_value(&plugin.capabilities)
        .map_err(|e| format!("Failed to serialize capabilities: {}", e))?;

    let config_json = serde_json::to_value(&plugin.config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    sqlx::query(
        "INSERT INTO installed_plugins (id, name, version, enabled, capabilities, config, files) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         ON CONFLICT (id) DO UPDATE SET \
            name = EXCLUDED.name, \
            version = EXCLUDED.version, \
            enabled = EXCLUDED.enabled, \
            capabilities = EXCLUDED.capabilities, \
            config = EXCLUDED.config, \
            files = EXCLUDED.files",
    )
    .bind(&plugin.id)
    .bind(&plugin.name)
    .bind(&plugin.version)
    .bind(plugin.enabled)
    .bind(capabilities_json)
    .bind(config_json)
    .bind(files)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Delete an installed plugin from the database.
pub async fn delete_installed_plugin(pool: &Option<PgPool>, id: &str) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    sqlx::query("DELETE FROM installed_plugins WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}
