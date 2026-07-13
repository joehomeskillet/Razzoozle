use sqlx::PgPool;

/// Create a new class owned by a user.
/// Returns the class id.
pub async fn create_class(
    pool: &Option<PgPool>,
    name: &str,
    owner_id: i64,
) -> Result<i64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query_as::<_, (i64,)>(
        "INSERT INTO classes (owner_id, name) VALUES ($1, $2) RETURNING id"
    )
    .bind(owner_id)
    .bind(name)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.0)
}

/// Get all classes for a user.
/// `me`: None = unfiltered (admin); Some(id) = only that owner's classes.
pub async fn get_classes(pool: &Option<PgPool>, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(i64, String, chrono::DateTime<chrono::Utc>)> = match sqlx::query_as(
        "SELECT id, name, created_at FROM classes \
         WHERE ($1::bigint IS NULL OR owner_id = $1) \
         ORDER BY created_at DESC"
    )
    .bind(me)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("Failed to fetch classes: {}", e);
            return vec![];
        }
    };

    rows.into_iter()
        .map(|(id, name, created_at)| {
            serde_json::json!({
                "id": id,
                "name": name,
                "createdAt": created_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            })
        })
        .collect()
}

/// Get a single class by id.
/// Returns Ok(class_obj) or Err if not found or not owned.
pub async fn get_class(
    pool: &Option<PgPool>,
    class_id: i64,
    me: Option<i64>,
) -> Result<serde_json::Value, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result: Option<(i64, String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT id, name, created_at FROM classes \
         WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)"
    )
    .bind(class_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Some((id, name, created_at)) => {
            Ok(serde_json::json!({
                "id": id,
                "name": name,
                "createdAt": created_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            }))
        }
        None => Err("class not found".to_string()),
    }
}

/// Update a class name.
/// Returns Ok(rows_affected): 0 = not found / not owned.
pub async fn update_class(
    pool: &Option<PgPool>,
    class_id: i64,
    name: &str,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query(
        "UPDATE classes SET name = $1 \
         WHERE id = $2 AND ($3::bigint IS NULL OR owner_id = $3)"
    )
    .bind(name)
    .bind(class_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Delete a class by id (cascades to students).
/// Returns Ok(rows_affected): 0 = not found / not owned.
pub async fn delete_class(
    pool: &Option<PgPool>,
    class_id: i64,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query(
        "DELETE FROM classes \
         WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)"
    )
    .bind(class_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Add a student to a class.
/// Returns the student id.
pub async fn add_student(
    pool: &Option<PgPool>,
    class_id: i64,
    display_name: &str,
    owner_id: i64,
) -> Result<i64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query_as::<_, (i64,)>(
        "INSERT INTO students (class_id, owner_id, display_name) VALUES ($1, $2, $3) RETURNING id"
    )
    .bind(class_id)
    .bind(owner_id)
    .bind(display_name)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.0)
}

/// Get all students in a class.
/// `me`: None = unfiltered (admin); Some(id) = only if user owns the class.
pub async fn get_students(pool: &Option<PgPool>, class_id: i64, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(i64, String, chrono::DateTime<chrono::Utc>)> = match sqlx::query_as(
        "SELECT s.id, s.display_name, s.created_at FROM students s \
         INNER JOIN classes c ON s.class_id = c.id \
         WHERE s.class_id = $1 AND ($2::bigint IS NULL OR c.owner_id = $2) \
         ORDER BY s.created_at ASC"
    )
    .bind(class_id)
    .bind(me)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("Failed to fetch students: {}", e);
            return vec![];
        }
    };

    rows.into_iter()
        .map(|(id, display_name, created_at)| {
            serde_json::json!({
                "id": id,
                "displayName": display_name,
                "createdAt": created_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            })
        })
        .collect()
}

/// Remove a student from a class.
/// Returns Ok(rows_affected): 0 = not found / not owned (via class ownership).
pub async fn remove_student(
    pool: &Option<PgPool>,
    student_id: i64,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query(
        "DELETE FROM students \
         WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)"
    )
    .bind(student_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Update a student's display name.
/// Returns Ok(rows_affected): 0 = not found / not owned.
pub async fn update_student(
    pool: &Option<PgPool>,
    student_id: i64,
    display_name: &str,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query(
        "UPDATE students SET display_name = $1 \
         WHERE id = $2 AND ($3::bigint IS NULL OR owner_id = $3)"
    )
    .bind(display_name)
    .bind(student_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn mutations_without_pool_return_err() {
        assert!(super::create_class(&None, "Test", 1).await.is_err());
        assert!(super::update_class(&None, 1, "Updated", Some(1)).await.is_err());
        assert!(super::delete_class(&None, 1, Some(1)).await.is_err());
        assert!(super::add_student(&None, 1, "Student", 1).await.is_err());
        assert!(super::remove_student(&None, 1, Some(1)).await.is_err());
        assert!(super::update_student(&None, 1, "Updated", Some(1)).await.is_err());
    }

    #[tokio::test]
    async fn get_queries_without_pool_return_empty() {
        assert_eq!(super::get_classes(&None, Some(1)).await.len(), 0);
        assert_eq!(super::get_students(&None, 1, Some(1)).await.len(), 0);
        assert!(super::get_class(&None, 1, Some(1)).await.is_err());
    }
}
