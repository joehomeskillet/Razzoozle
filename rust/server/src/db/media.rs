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
