use sqlx::PgPool;

/// Load media assets from the database.
/// Returns a vector of serde_json objects with the shape matching Node's MediaMeta.
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_media_list(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, String, i32, String, String, String, Option<i32>, Option<i32>, chrono::DateTime<chrono::Utc>)> =
        match sqlx::query_as(
            "SELECT id, filename, url, size, type, category, source, width, height, uploaded_at \
             FROM media_assets ORDER BY uploaded_at DESC"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch media_assets from database: {}", e);
                return Vec::new();
            }
        };

    let mut result = Vec::new();

    for (id, filename, url, size, media_type, category, source, width, height, uploaded_at) in rows {
        // uploaded_at is a TIMESTAMPTZ decoded into DateTime<Utc>; emit as RFC3339.
        let uploaded_at_rfc3339 = uploaded_at.to_rfc3339();

        let mut media_obj = serde_json::json!({
            "id": id,
            "filename": filename,
            "url": url,
            "size": size,
            "type": media_type,
            "category": category,
            "source": source,
            "uploadedAt": uploaded_at_rfc3339,
        });

        // Add width only if non-null
        if let Some(w) = width {
            media_obj["width"] = serde_json::json!(w);
        }

        // Add height only if non-null
        if let Some(h) = height {
            media_obj["height"] = serde_json::json!(h);
        }

        result.push(media_obj);
    }

    result
}

/// Insert a media asset into the database.
/// Returns Ok(id) on success, or Err(message) on failure.
pub async fn insert_media_asset(
    pool: &Option<PgPool>,
    id: &str,
    filename: &str,
    url: &str,
    size: i32,
    media_type: &str,
    category: &str,
    source: &str,
    width: Option<i32>,
    height: Option<i32>,
    uploaded_at: chrono::DateTime<chrono::Utc>,
    data: &[u8],
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("Database not available".to_string()),
    };

    sqlx::query(
        "INSERT INTO media_assets (id, filename, url, size, type, category, source, width, height, uploaded_at, data) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
    )
    .bind(id)
    .bind(filename)
    .bind(url)
    .bind(size)
    .bind(media_type)
    .bind(category)
    .bind(source)
    .bind(width)
    .bind(height)
    .bind(uploaded_at)
    .bind(data)
    .execute(pool)
    .await
    .map(|_| id.to_string())
    .map_err(|e| e.to_string())
}

/// Delete a media asset from the database.
/// Returns true if a row was deleted, false if not found or on error.
pub async fn delete_media_asset(pool: &Option<PgPool>, id: &str) -> bool {
    let pool = match pool {
        Some(p) => p,
        None => return false,
    };

    match sqlx::query("DELETE FROM media_assets WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
    {
        Ok(result) => result.rows_affected() > 0,
        Err(_) => false,
    }
}

/// Delete media assets by slot prefix (theme uploads cleanup).
/// Deletes all media_assets rows where filename LIKE '<slot>-%' AND source = 'theme'.
pub async fn delete_media_assets_by_slot(pool: &Option<PgPool>, slot: &str, source: &str) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Ok(()),
    };

    let pattern = format!("{}-%", slot);
    sqlx::query("DELETE FROM media_assets WHERE filename LIKE $1 AND source = $2")
        .bind(&pattern)
        .bind(source)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Get media assets with url and data for hydration.
/// Returns Vec<(url, data)> for all media_assets where data IS NOT NULL.
/// Returns empty vec if pool is None or query fails.
pub async fn get_media_for_hydrate(pool: &Option<sqlx::PgPool>) -> Vec<(String, Vec<u8>)> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Vec<u8>)> =
        match sqlx::query_as(
            "SELECT url, data FROM media_assets WHERE data IS NOT NULL ORDER BY uploaded_at DESC"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch media_assets for hydration from database: {}", e);
                return Vec::new();
            }
        };

    rows
}

/// Boot-hydrate media assets from Postgres to disk.
/// Idempotent: only writes if file is missing or size differs.
/// Empty-guard: if no media rows, returns immediately without touching disk.
/// Non-fatal: logs errors but doesn't panic.
pub async fn hydrate_media_from_pg(pool: &Option<sqlx::PgPool>, config_base: &str) {
    let media_assets = get_media_for_hydrate(pool).await;

    // Empty-guard: if PG has 0 media rows, do nothing (never nuke existing disk files)
    if media_assets.is_empty() {
        return;
    }

    let total_count = media_assets.len();

    // Ensure media directories exist
    let media_base = format!("{}/media", config_base);
    if let Err(e) = std::fs::create_dir_all(&media_base) {
        eprintln!("Failed to create media directory '{}': {}", media_base, e);
        return;
    }

    // Create standard category subdirectories
    for category in &["questions", "backgrounds", "audio", "avatars", "generated"] {
        let cat_dir = format!("{}/{}", media_base, category);
        if let Err(e) = std::fs::create_dir_all(&cat_dir) {
            eprintln!("Failed to create media category directory '{}': {}", cat_dir, e);
        }
    }

    // Write each media file to disk (only if missing or size mismatch)
    let mut written = 0;
    for (url, data) in media_assets {
        // Extract path from url: "/media/<category>/<filename>" -> "<category>/<filename>"
        let rel_path = if let Some(stripped) = url.strip_prefix("/media/") {
            stripped
        } else {
            eprintln!("media hydrate: Invalid url format '{}' (expected '/media/<category>/<filename>')", url);
            continue;
        };


        // Path traversal guard: reject unsafe paths
        if rel_path.is_empty()
            || rel_path.starts_with('/')
            || rel_path.split('/').any(|c| c == ".." || c.is_empty())
        {
            eprintln!("media hydrate: rejecting unsafe path from url '{}' (traversal/absolute)", url);
            continue;
        }


        let file_path = format!("{}/{}", media_base, rel_path);

        // Check if file exists and has matching size
        if std::path::Path::new(&file_path).exists() {
            if let Ok(stat) = std::fs::metadata(&file_path) {
                if stat.len() == data.len() as u64 {
                    // File exists and size matches — skip
                    continue;
                }
            }
        }

        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(&file_path).parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                eprintln!("Failed to create parent directory for '{}': {}", file_path, e);
                continue;
            }
        }

        // Write the file
        match std::fs::write(&file_path, &data) {
            Ok(_) => written += 1,
            Err(e) => {
                eprintln!("Failed to write media file '{}': {}", file_path, e);
            }
        }
    }

    eprintln!("media hydrate: {} assets, {} written", total_count, written);
}
