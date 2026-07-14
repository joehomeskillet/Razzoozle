use sqlx::PgPool;

/// Get all global labels (admin-defined Fächer).
pub async fn get_labels(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(i64, String, String)> = match sqlx::query_as(
        "SELECT id, name, color FROM labels ORDER BY created_at ASC"
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("Failed to fetch labels: {}", e);
            return vec![];
        }
    };

    rows.into_iter()
        .map(|(id, name, color)| {
            serde_json::json!({
                "id": id,
                "name": name,
                "color": color,
            })
        })
        .collect()
}

/// Create a new global label. Returns label_id on success, or "name_exists" error if duplicate.
pub async fn create_label(
    pool: &Option<PgPool>,
    name: &str,
    color: &str,
) -> Result<i64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query_as::<_, (i64,)>(
        "INSERT INTO labels (name, color) VALUES ($1, $2) RETURNING id"
    )
    .bind(name)
    .bind(color)
    .fetch_one(pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(db_err) = &e {
            if db_err.code().as_deref() == Some("23505") {
                return "name_exists".to_string();
            }
        }
        e.to_string()
    })?;

    Ok(result.0)
}

/// Update a label (name and/or color). Returns rows_affected: 0 = not found.
pub async fn update_label(
    pool: &Option<PgPool>,
    label_id: i64,
    name: Option<&str>,
    color: Option<&str>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let (query, bind_name, bind_color) = if let (Some(n), Some(c)) = (name, color) {
        ("UPDATE labels SET name = $1, color = $2 WHERE id = $3", Some(n), Some(c))
    } else if let Some(n) = name {
        ("UPDATE labels SET name = $1 WHERE id = $2", Some(n), None)
    } else if let Some(c) = color {
        ("UPDATE labels SET color = $1 WHERE id = $2", None, Some(c))
    } else {
        return Ok(0); // No update fields
    };

    let mut q = sqlx::query(query);
    if let Some(n) = bind_name {
        q = q.bind(n);
    }
    if let Some(c) = bind_color {
        q = q.bind(c);
    }
    q = q.bind(label_id);

    let result = q
        .execute(pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(db_err) = &e {
                if db_err.code().as_deref() == Some("23505") {
                    return "name_exists".to_string();
                }
            }
            e.to_string()
        })?;

    Ok(result.rows_affected())
}

/// Delete a label (cascades to all junction tables).
pub async fn delete_label(pool: &Option<PgPool>, label_id: i64) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query("DELETE FROM labels WHERE id = $1")
        .bind(label_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Set labels for an entity (quiz, media, or catalog). Replace-set semantics: delete all existing, insert new.
/// `entity_type`: "quizz", "media", or "catalog"
/// `label_ids`: the new set of label IDs (may be empty)
pub async fn assign_labels(
    pool: &Option<PgPool>,
    entity_type: &str,
    entity_id: &str,
    label_ids: &[i64],
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let table = match entity_type {
        "quizz" => "quiz_labels",
        "media" => "media_labels",
        "catalog" => "catalog_labels",
        _ => return Err("invalid entity_type".to_string()),
    };

    let (id_col, entity_col) = (
        match entity_type {
            "quizz" => ("quiz_id", "quiz_id"),
            "media" => ("media_id", "media_id"),
            "catalog" => ("catalog_id", "catalog_id"),
            _ => ("id", "id"),
        },
        match entity_type {
            "quizz" => "quiz_id",
            "media" => "media_id",
            "catalog" => "catalog_id",
            _ => "id",
        },
    );

    // Begin transaction
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Delete existing assignments
    let delete_query = format!("DELETE FROM {} WHERE {} = $1", table, entity_col);
    sqlx::query(&delete_query)
        .bind(entity_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Insert new assignments (skip if empty)
    if !label_ids.is_empty() {
        let insert_query = format!(
            "INSERT INTO {} ({}, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            table, entity_col
        );
        for label_id in label_ids {
            sqlx::query(&insert_query)
                .bind(entity_id)
                .bind(label_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Fetch label IDs for a single entity (quiz, media, or catalog).
pub async fn get_label_ids(
    pool: &Option<PgPool>,
    entity_type: &str,
    entity_id: &str,
) -> Vec<i64> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let (table, col) = match entity_type {
        "quizz" => ("quiz_labels", "quiz_id"),
        "media" => ("media_labels", "media_id"),
        "catalog" => ("catalog_labels", "catalog_id"),
        _ => return vec![],
    };

    let query = format!("SELECT label_id FROM {} WHERE {} = $1 ORDER BY label_id ASC", table, col);

    match sqlx::query_as::<_, (i64,)>(&query)
        .bind(entity_id)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows.into_iter().map(|(id,)| id).collect(),
        Err(e) => {
            eprintln!("Failed to fetch label_ids: {}", e);
            vec![]
        }
    }
}

/// Carry labels from one quiz to another (on rename). Moves all labels from old_id to new_id,
/// before old_id is replaced/deleted. No-op if old_id == new_id or old_id doesn't exist.
pub async fn carry_over_quiz_labels(
    pool: &Option<PgPool>,
    old_id: &str,
    new_id: &str,
) -> Result<(), String> {
    if old_id == new_id {
        return Ok(()); // No-op if IDs are the same
    }

    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Carry quiz_labels to new ID (before old record is replaced/deleted)
    sqlx::query("UPDATE quiz_labels SET quiz_id = $1 WHERE quiz_id = $2")
        .bind(new_id)
        .bind(old_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Check if a quiz is visible/owned by the user.
/// `me`: None = admin (sees all); Some(id) = only own.
pub async fn quiz_is_visible(pool: &Option<PgPool>, quiz_id: &str, me: Option<i64>) -> bool {
    let pool = match pool {
        Some(p) => p,
        None => return false,
    };

    match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM quizzes WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2))"
    )
    .bind(quiz_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(exists)) => exists,
        _ => false,
    }
}

/// Check if media is visible/owned by the user.
pub async fn media_is_visible(pool: &Option<PgPool>, media_id: &str, me: Option<i64>) -> bool {
    let pool = match pool {
        Some(p) => p,
        None => return false,
    };

    match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM media_assets WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2))"
    )
    .bind(media_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(exists)) => exists,
        _ => false,
    }
}

/// Check if catalog entry is visible/owned by the user.
pub async fn catalog_is_visible(pool: &Option<PgPool>, catalog_id: &str, me: Option<i64>) -> bool {
    let pool = match pool {
        Some(p) => p,
        None => return false,
    };

    match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM catalog_entries WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2))"
    )
    .bind(catalog_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(exists)) => exists,
        _ => false,
    }
}
