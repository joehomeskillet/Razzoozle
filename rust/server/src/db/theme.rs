use sqlx::PgPool;

/// Load theme templates from the database.
/// Returns a vector of serde_json objects with ThemeTemplateMeta shape (id, name).
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_themes(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String)> =
        // The 'active' row is the theme-mirror written by upsert_theme (name=NULL), not a template — exclude it instead of Option<String>-decoding; Node lists templates from disk and never sees the mirror row.
        match sqlx::query_as(
            "SELECT id, name FROM themes WHERE id <> 'active' AND name IS NOT NULL ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch theme_templates from database: {}", e);
                return Vec::new();
            }
        };

    let result = rows.into_iter()
        .map(|(id, name)| serde_json::json!({"id": id, "name": name}))
        .collect();

    result
}

/// Fetch the active theme (currently stored in a dedicated table or config).
pub async fn get_theme(pool: &Option<PgPool>) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(serde_json::Value,)> = sqlx::query_as(
        "SELECT theme FROM themes WHERE id = 'active' LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    row.map(|(theme_data,)| theme_data)
}

/// Save the active theme to the database (upsert).
pub async fn upsert_theme(
    pool: &Option<PgPool>,
    theme_data: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    sqlx::query(
        "INSERT INTO themes (id, theme, updated_at) VALUES ('active', $1, now()) \
         ON CONFLICT (id) DO UPDATE SET theme = $1, updated_at = now()"
    )
    .bind(theme_data)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Load full theme templates from the database with theme payload.
/// Returns a vector of serde_json objects with ThemeTemplate shape (id, name, theme).
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_theme_templates_full(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, serde_json::Value)> =
        // The 'active' row is the theme-mirror written by upsert_theme (name=NULL), not a template — exclude it instead of Option<String>-decoding; Node lists templates from disk and never sees the mirror row.
        match sqlx::query_as(
            "SELECT id, name, theme FROM themes WHERE id <> 'active' AND name IS NOT NULL ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch theme_templates (full) from database: {}", e);
                return Vec::new();
            }
        };

    let result = rows.into_iter()
        .map(|(id, name, theme)| serde_json::json!({"id": id, "name": name, "theme": theme}))
        .collect();

    result
}

/// Upsert a theme template into the database.
/// If the id already exists, updates name and theme; otherwise inserts a new row.
/// Returns Ok(()) on success, or Err on database failure.
pub async fn upsert_theme_template(
    pool: &Option<PgPool>,
    id: &str,
    name: &str,
    theme: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Ok(()), // No pool, silently skip
    };

    sqlx::query(
        "INSERT INTO themes (id, name, theme) VALUES ($1, $2, $3) \
         ON CONFLICT (id) DO UPDATE SET name = $2, theme = $3, updated_at = CURRENT_TIMESTAMP"
    )
    .bind(id)
    .bind(name)
    .bind(theme)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Delete a theme template from the database.
/// Throws an error if the template is not found.
pub async fn delete_theme_template(pool: &Option<PgPool>, id: &str) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:themeTemplate.notFound".to_string()),
    };

    let result = sqlx::query("DELETE FROM themes WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() > 0 {
        Ok(())
    } else {
        Err("errors:themeTemplate.notFound".to_string())
    }
}

/// Insert a theme revision into the database and prune to newest 10.
/// The full revision entry {id, createdAt, theme} is stored in theme_snapshot.
/// No-op if pool is None.
pub async fn insert_theme_revision(
    pool: &Option<PgPool>,
    snapshot: &serde_json::Value,
    created_at_rfc3339: &str,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Ok(()),
    };

    // INSERT the revision
    sqlx::query(
        "INSERT INTO theme_revisions (theme_id, theme_snapshot, created_at) \
         VALUES ('active', $1, $2::timestamptz)"
    )
    .bind(snapshot)
    .bind(created_at_rfc3339)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to insert theme revision: {}", e))?;

    // Prune to keep only newest 10
    sqlx::query(
        "DELETE FROM theme_revisions WHERE theme_id='active' AND id NOT IN \
         (SELECT id FROM theme_revisions WHERE theme_id='active' ORDER BY id DESC LIMIT 10)"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to prune theme revisions: {}", e))?;

    Ok(())
}

/// List all theme revisions for the active theme, newest-first (up to 10).
/// Each item in the returned vec IS the full theme_snapshot {id, createdAt, theme}.
/// Returns empty vec if pool is None or on error.
pub async fn list_theme_revisions(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(serde_json::Value,)> = match sqlx::query_as(
        "SELECT theme_snapshot FROM theme_revisions WHERE theme_id='active' \
         ORDER BY id DESC LIMIT 10"
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("Failed to fetch theme revisions: {}", e);
            return Vec::new();
        }
    };

    rows.into_iter().map(|(snapshot,)| snapshot).collect()
}

/// Get a specific theme revision by its id field (within theme_snapshot).
/// Returns the full theme_snapshot if found, None otherwise.
pub async fn get_theme_revision_by_id(
    pool: &Option<PgPool>,
    id: &str,
) -> Option<serde_json::Value> {
    let pool = pool.as_ref()?;

    sqlx::query_as::<_, (serde_json::Value,)>(
        "SELECT theme_snapshot FROM theme_revisions WHERE theme_id='active' AND \
         theme_snapshot->>'id' = $1 ORDER BY id DESC LIMIT 1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|(snapshot,)| snapshot)
}
