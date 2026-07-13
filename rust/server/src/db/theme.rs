use sqlx::PgPool;
use tracing::warn;

/// Load theme templates from the database.
/// Returns a vector of serde_json objects with ThemeTemplateMeta shape (id, name).
/// Returns empty vec if pool is None or DB query fails.
/// `me`: None = unfiltered (admin); Some(id) = only that owner's templates.
/// Note: the 'active' row is never listed here (excluded by id filter).
pub async fn get_themes(pool: &Option<PgPool>, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String)> =
        // The 'active' row is the theme-mirror written by upsert_theme (name=NULL), not a template — exclude it instead of Option<String>-decoding; Node lists templates from disk and never sees the mirror row.
        match sqlx::query_as(
            "SELECT id, name FROM themes \
             WHERE id <> 'active' AND name IS NOT NULL \
               AND ($1::bigint IS NULL OR owner_id = $1) \
             ORDER BY id"
        )
        .bind(me)
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
/// The 'active' row is never owner-scoped — always returns the global active theme.
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
/// owner_id is always NULL for id='active' (never owned).
pub async fn upsert_theme(
    pool: &Option<PgPool>,
    theme_data: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    sqlx::query(
        "INSERT INTO themes (id, theme, updated_at, owner_id) VALUES ('active', $1, now(), NULL) \
         ON CONFLICT (id) DO UPDATE SET theme = $1, updated_at = now(), owner_id = NULL"
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
/// `me`: None = unfiltered (admin); Some(id) = only that owner's templates.
pub async fn get_theme_templates_full(
    pool: &Option<PgPool>,
    me: Option<i64>,
) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, serde_json::Value)> =
        // The 'active' row is the theme-mirror written by upsert_theme (name=NULL), not a template — exclude it instead of Option<String>-decoding; Node lists templates from disk and never sees the mirror row.
        match sqlx::query_as(
            "SELECT id, name, theme FROM themes \
             WHERE id <> 'active' AND name IS NOT NULL \
               AND ($1::bigint IS NULL OR owner_id = $1) \
             ORDER BY id"
        )
        .bind(me)
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
/// Returns Ok(rows_affected): 0 = conflict row not owned / no-op.
/// `owner_id` is stamped on INSERT; not overwritten on conflict.
/// `me`: None = admin/unguarded DO UPDATE; Some(id) = only update if owner_id matches.
pub async fn upsert_theme_template(
    pool: &Option<PgPool>,
    id: &str,
    name: &str,
    theme: &serde_json::Value,
    owner_id: Option<i64>,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Ok(0), // No pool, silently skip
    };

    let result = sqlx::query(
        "INSERT INTO themes (id, name, theme, owner_id) VALUES ($1, $2, $3, $4) \
         ON CONFLICT (id) DO UPDATE SET name = $2, theme = $3, updated_at = CURRENT_TIMESTAMP \
         WHERE ($5::bigint IS NULL OR themes.owner_id = $5)",
    )
    .bind(id)
    .bind(name)
    .bind(theme)
    .bind(owner_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Delete a theme template from the database.
/// Guards against deletion of the 'active' template to match Node's behavior.
/// Returns Ok(rows_affected): 0 = not found / not owned / is active.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
pub async fn delete_theme_template(
    pool: &Option<PgPool>,
    id: &str,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:themeTemplate.notFound".to_string()),
    };

    let result = sqlx::query(
        "DELETE FROM themes WHERE id = $1 AND id != $2 \
         AND ($3::bigint IS NULL OR owner_id = $3)",
    )
    .bind(id)
    .bind("active")
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        warn!("Attempted to delete protected/unowned theme template: {}", id);
    }

    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn mutation_without_pool() {
        let theme = serde_json::json!({});
        assert_eq!(
            super::upsert_theme_template(&None, "t", "n", &theme, Some(1), Some(1))
                .await
                .unwrap(),
            0
        );
        assert!(super::delete_theme_template(&None, "t", Some(1)).await.is_err());
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
