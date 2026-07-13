use sqlx::PgPool;

/// Update a submission with a partial patch.
/// Only updates fields that are present in the patch (status, rejectionReason, category, question).
pub async fn insert_catalog_entry(
    pool: &Option<PgPool>,
    question: &serde_json::Value,
    source: &str,
    added_at: chrono::DateTime<chrono::Utc>,
    owner_id: Option<i64>,
) -> Result<String, String> {
    insert_catalog_entry_with_tags(
        pool,
        question,
        source,
        &serde_json::json!([]),
        added_at,
        owner_id,
    )
    .await
}

/// Same as `insert_catalog_entry` but also persists `tags` (defaults to `[]`
/// when the caller has none, e.g. the submission-approve path).
pub async fn insert_catalog_entry_with_tags(
    pool: &Option<PgPool>,
    question: &serde_json::Value,
    source: &str,
    tags: &serde_json::Value,
    added_at: chrono::DateTime<chrono::Utc>,
    owner_id: Option<i64>,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Extract the question text to derive the id
    let question_text = question
        .get("question")
        .and_then(|v| v.as_str())
        .unwrap_or("untitled");

    // Normalize the question text to an id (lowercase, hyphens, no special chars)
    let base_id = question_text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|seg| !seg.is_empty())
        .collect::<Vec<&str>>()
        .join("-");

    // Check for existing entries and deduplicate with -2, -3 suffix
    let mut id = base_id.clone();
    let mut suffix = 2;

    loop {
        let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM catalog_entries WHERE id = $1")
            .bind(&id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

        if existing.is_none() {
            break;
        }

        id = format!("{}-{}", base_id, suffix);
        suffix += 1;
    }

    // Insert the catalog entry
    sqlx::query(
        "INSERT INTO catalog_entries (id, question, tags, source, added_at, owner_id) \
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&id)
    .bind(question)
    .bind(tags)
    .bind(source)
    .bind(added_at)
    .bind(owner_id)
    .execute(pool)
    .await
    .map(|_| id)
    .map_err(|e| e.to_string())
}

/// Fetch all catalog entries as an array of JSON objects (matches the
/// Node `CatalogEntry` shape: id, question, tags, source, addedAt).
/// `me`: None = unfiltered (admin); Some(id) = own rows + is_global.
pub async fn get_catalog(pool: &Option<PgPool>, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(String, serde_json::Value, serde_json::Value, Option<String>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
        "SELECT id, question, tags, source, added_at FROM catalog_entries \
         WHERE ($1::bigint IS NULL OR owner_id = $1 OR is_global = true) \
         ORDER BY added_at DESC"
    )
    .bind(me)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    rows.iter()
        .map(|(id, question, tags, source, added_at)| {
            serde_json::json!({
                "id": id,
                "question": question,
                "tags": tags,
                "source": source,
                "addedAt": added_at.map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
            })
        })
        .collect()
}

/// Update a catalog entry's question + tags fields.
/// Returns Ok(rows_affected): 0 = not found / not owned.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
pub async fn update_catalog_entry(
    pool: &Option<PgPool>,
    id: &str,
    question: &serde_json::Value,
    tags: &serde_json::Value,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query(
        "UPDATE catalog_entries SET question = $1, tags = $2 \
         WHERE id = $3 AND ($4::bigint IS NULL OR owner_id = $4)",
    )
    .bind(question)
    .bind(tags)
    .bind(id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Delete a catalog entry by id. Returns Ok(rows_affected): 0 = not found / not owned.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
pub async fn delete_catalog_entry(
    pool: &Option<PgPool>,
    id: &str,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query(
        "DELETE FROM catalog_entries WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)",
    )
    .bind(id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn mutation_without_pool_returns_err() {
        let q = serde_json::json!({"question": "x"});
        let tags = serde_json::json!([]);
        assert!(super::update_catalog_entry(&None, "id", &q, &tags, Some(1))
            .await
            .is_err());
        assert!(super::delete_catalog_entry(&None, "id", Some(1)).await.is_err());
    }
}
