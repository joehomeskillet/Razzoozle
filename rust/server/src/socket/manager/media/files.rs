use std::fs;
use std::path::Path;

/// Normalize filename: lowercase, strip non-alphanumeric (keep hyphens/underscores), max 64 chars.
/// parity: minimal accent fold — full Unicode NFD = Wave 4b
pub(super) fn normalize_media_stem(filename: &str) -> String {
    // Extract stem (filename without extension)
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("media");

    // Lowercase first, then fold accents: ä→a, ö→o, ü→u, ß→ss, é/è/ê/ë→e, etc.
    let folded = stem
        .to_lowercase()
        .chars()
        .flat_map(|c| match c {
            // Umlauts & German
            'ä' => vec!['a'],
            'ö' => vec!['o'],
            'ü' => vec!['u'],
            'ß' => vec!['s', 's'],
            // French/Spanish accents: e-family
            'é' | 'è' | 'ê' | 'ë' => vec!['e'],
            // e-family continued
            'á' | 'à' | 'â' | 'ã' | 'å' => vec!['a'],
            'í' | 'ì' | 'î' | 'ï' => vec!['i'],
            'ó' | 'ò' | 'ô' | 'õ' => vec!['o'],
            'ú' | 'ù' | 'û' | 'ũ' => vec!['u'],
            'ç' => vec!['c'],
            'ñ' => vec!['n'],
            other => vec![other],
        })
        .collect::<String>();

    // Replace spaces/non-alnum with hyphens, trim leading/trailing hyphens, cap at 64
    let normalized = folded
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|seg| !seg.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
        .chars()
        .take(64)
        .collect::<String>();

    if normalized.is_empty() {
        "media".to_string()
    } else {
        normalized
    }
}

/// Write media file to disk at config/media/<category>/<filename>.
pub(super) fn write_media_file(buffer: &[u8], category: &str, filename: &str) -> Result<(), String> {
    let media_dir = Path::new("config/media").join(category);

    // Ensure directory exists
    if !media_dir.exists() {
        fs::create_dir_all(&media_dir)
            .map_err(|_| "errors:media.saveFailed".to_string())?;
    }

    let filepath = media_dir.join(filename);

    // Write file
    fs::write(&filepath, buffer).map_err(|_| "errors:media.saveFailed".to_string())?;

    Ok(())
}

/// Delete media file from disk at config/media/<category>/<filename>.
pub(super) fn delete_media_file(category: &str, filename: &str) -> Result<(), String> {
    let filepath = Path::new("config/media").join(category).join(filename);

    if filepath.exists() {
        fs::remove_file(&filepath).map_err(|_| "errors:media.saveFailed".to_string())?;
    }

    Ok(())
}

/// Query database for a media asset by ID.
/// Returns the full media asset object or None if not found.
pub(super) async fn get_media_asset_by_id(
    pool: &Option<sqlx::PgPool>,
    id: &str,
) -> Option<serde_json::Value> {
    let pool = pool.as_ref()?;

    match sqlx::query_as::<_, (String, String, String, i32, String, String, String, Option<i32>, Option<i32>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, filename, url, size, type, category, source, width, height, uploaded_at FROM media_assets WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(Some((id, filename, url, size, media_type, category, source, width, height, uploaded_at))) => {
            let uploaded_at_rfc3339 = uploaded_at.to_rfc3339();
            let mut obj = serde_json::json!({
                "id": id,
                "filename": filename,
                "url": url,
                "size": size,
                "type": media_type,
                "category": category,
                "source": source,
                "uploadedAt": uploaded_at_rfc3339,
            });
            if let Some(w) = width {
                obj["width"] = serde_json::json!(w);
            }
            if let Some(h) = height {
                obj["height"] = serde_json::json!(h);
            }
            Some(obj)
        }
        _ => None,
    }
}
