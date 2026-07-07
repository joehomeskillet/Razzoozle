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
        match sqlx::query_as(
            "SELECT id, name FROM themes ORDER BY id"
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
        "SELECT theme_data FROM themes WHERE id = 'active' LIMIT 1"
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
        match sqlx::query_as(
            "SELECT id, name, theme FROM themes ORDER BY id"
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

