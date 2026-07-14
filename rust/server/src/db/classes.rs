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

/// Get all classes for a user.
/// `me`: None = unfiltered (admin); Some(id) = only that owner's classes.
pub async fn get_classes(pool: &Option<PgPool>, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(i64, String, chrono::DateTime<chrono::Utc>, i64)> = match sqlx::query_as(
        "SELECT c.id, c.name, c.created_at, COALESCE(jt.student_count, 0) as student_count \
         FROM classes c \
         LEFT JOIN (SELECT class_id, count(*) as student_count FROM class_students GROUP BY class_id) jt ON c.id = jt.class_id \
         WHERE ($1::bigint IS NULL OR c.owner_id = $1) \
         ORDER BY c.created_at DESC"
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
        .map(|(id, name, created_at, student_count)| {
            serde_json::json!({
                "id": id,
                "name": name,
                "createdAt": created_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                "studentCount": student_count,
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

/// Delete a class by id (cascades to class_students junction rows, which may trigger orphan deletion).
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

/// Add a student to a class (dual-write to students + class_students junction).
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

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Insert student with legacy class_id for compat window
    let student_result = sqlx::query_as::<_, (i64,)>(
        "INSERT INTO students (class_id, owner_id, display_name) VALUES ($1, $2, $3) RETURNING id"
    )
    .bind(class_id)
    .bind(owner_id)
    .bind(display_name)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let student_id = student_result.0;

    // Insert junction row
    sqlx::query(
        "INSERT INTO class_students (class_id, student_id, joined_at) VALUES ($1, $2, now())"
    )
    .bind(class_id)
    .bind(student_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(student_id)
}

/// Get all students in a class via junction table.
/// `me`: None = unfiltered (admin); Some(id) = only if user owns the class.
pub async fn get_students(pool: &Option<PgPool>, class_id: i64, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(i64, String, chrono::DateTime<chrono::Utc>)> = match sqlx::query_as(
        "SELECT s.id, s.display_name, s.created_at FROM students s \
         INNER JOIN class_students cs ON s.id = cs.student_id \
         INNER JOIN classes c ON cs.class_id = c.id \
         WHERE cs.class_id = $1 AND ($2::bigint IS NULL OR c.owner_id = $2) \
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

/// Remove all class memberships for a student and delete the student row.
/// Returns Ok(rows_affected): 0 = not found / not owned (via class ownership check).
/// Works correctly with or without the orphan-delete trigger (explicit delete is idempotent).
pub async fn remove_student(
    pool: &Option<PgPool>,
    student_id: i64,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Check permission: is_admin OR students.owner_id == me OR me in any class_students.class_id
    let has_permission = if let Some(user_id) = me {
        let exists: Option<(i64,)> = sqlx::query_as(
            "SELECT 1::bigint \
             WHERE EXISTS (SELECT 1 FROM students WHERE id = $1 AND owner_id = $2) \
             OR EXISTS ( \
               SELECT 1 FROM class_students cs \
               INNER JOIN classes c ON cs.class_id = c.id \
               WHERE cs.student_id = $1 AND c.owner_id = $2 \
             )"
        )
        .bind(student_id)
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        exists.is_some()
    } else {
        true
    };

    if !has_permission {
        tx.rollback().await.ok();
        return Ok(0);
    }

    sqlx::query("DELETE FROM class_students WHERE student_id = $1")
        .bind(student_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let result = sqlx::query("DELETE FROM students WHERE id = $1")
        .bind(student_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    
    if result.rows_affected() > 0 {
        Ok(1)
    } else {
        Ok(0)
    }
}

/// Update a student's display name and log to audit table.
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

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Fetch old display_name for audit
    let old_name: Option<(String,)> = sqlx::query_as(
        "SELECT display_name FROM students \
         WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)"
    )
    .bind(student_id)
    .bind(me)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let old_display_name = match old_name {
        Some((name,)) => name,
        None => return Ok(0), // Not found or not owned
    };

    // Update student
    let result = sqlx::query(
        "UPDATE students SET display_name = $1 \
         WHERE id = $2 AND ($3::bigint IS NULL OR owner_id = $3)"
    )
    .bind(display_name)
    .bind(student_id)
    .bind(me)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Insert audit log
    sqlx::query(
        "INSERT INTO students_audit (student_id, actor_id, old_display_name, new_display_name, changed_at) \
         VALUES ($1, $2, $3, $4, now())"
    )
    .bind(student_id)
    .bind(me)
    .bind(&old_display_name)
    .bind(display_name)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

/// Move a student from one class to another (idempotent insertion to class_students).
/// Returns Ok if successful.
/// Permission: `me` must own the target class AND be allowed to manage the student.
pub async fn move_student_to_class(
    pool: &Option<PgPool>,
    student_id: i64,
    class_id: i64,
    me: Option<i64>,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Verify me owns the target class
    let owns_class: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM classes WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)"
    )
    .bind(class_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if owns_class.is_none() {
        return Err("class not found or not owned".to_string());
    }

    // Verify me can manage the student
    if !can_manage_student_internal(pool, student_id, me).await? {
        return Err("cannot manage student".to_string());
    }

    // Insert junction row (idempotent: ON CONFLICT DO NOTHING)
    sqlx::query(
        "INSERT INTO class_students (class_id, student_id, joined_at) VALUES ($1, $2, now()) \
         ON CONFLICT (class_id, student_id) DO NOTHING"
    )
    .bind(class_id)
    .bind(student_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Remove a student from a specific class.
/// Returns Ok(true) if the student was orphan-deleted, Ok(false) if student still exists.
/// Permission: `me` must own the target class.
pub async fn remove_student_from_class(
    pool: &Option<PgPool>,
    student_id: i64,
    class_id: i64,
    me: Option<i64>,
) -> Result<bool, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Verify me owns the class
    let owns_class: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM classes WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)"
    )
    .bind(class_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if owns_class.is_none() {
        return Err("class not found or not owned".to_string());
    }

    // Delete the junction row (orphan trigger may delete student)
    sqlx::query(
        "DELETE FROM class_students WHERE student_id = $1 AND class_id = $2"
    )
    .bind(student_id)
    .bind(class_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Check if student still exists
    let exists: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM students WHERE id = $1"
    )
    .bind(student_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(exists.is_none())
}

/// Get all classes for a student, scoped to classes visible to `me`.
/// Returns [{id, name, joined_at}].
pub async fn get_student_classes(
    pool: &Option<PgPool>,
    student_id: i64,
    me: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let rows: Vec<(i64, String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT c.id, c.name, cs.joined_at FROM classes c \
         INNER JOIN class_students cs ON c.id = cs.class_id \
         WHERE cs.student_id = $1 AND ($2::bigint IS NULL OR c.owner_id = $2) \
         ORDER BY cs.joined_at ASC"
    )
    .bind(student_id)
    .bind(me)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter()
        .map(|(id, name, joined_at)| {
            serde_json::json!({
                "id": id,
                "name": name,
                "joinedAt": joined_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            })
        })
        .collect())
}

/// List all students manageable by `me` with their class memberships aggregated.
/// Returns [{id, displayName, classes: [{id, name}]}].
/// Admin (None) sees all students; regular users see students in their classes only.
pub async fn list_all_students(
    pool: &Option<PgPool>,
    me: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Fetch all students visible to me (either admin or own a class containing them)
    let students: Vec<(i64, String, Option<chrono::NaiveDate>)> = sqlx::query_as(
        "SELECT DISTINCT s.id, s.display_name, s.birthdate FROM students s \
         WHERE $1::bigint IS NULL OR EXISTS ( \
           SELECT 1 FROM class_students cs \
           INNER JOIN classes c ON cs.class_id = c.id \
           WHERE cs.student_id = s.id AND c.owner_id = $1 \
         ) OR s.owner_id = $1"
    )
    .bind(me)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();

    for (student_id, display_name, birthdate) in students {
        // Fetch classes for this student
        let classes: Vec<(i64, String)> = sqlx::query_as(
            "SELECT c.id, c.name FROM classes c \
             INNER JOIN class_students cs ON c.id = cs.class_id \
             WHERE cs.student_id = $1 AND ($2::bigint IS NULL OR c.owner_id = $2) \
             ORDER BY c.name ASC"
        )
        .bind(student_id)
        .bind(me)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        let classes_json: Vec<serde_json::Value> = classes
            .into_iter()
            .map(|(id, name)| {
                serde_json::json!({
                    "id": id,
                    "name": name,
                })
            })
            .collect();

        result.push(serde_json::json!({
            "id": student_id,
            "displayName": display_name,
            "classes": classes_json,
            "birthdate": birthdate.map(|d| d.format("%Y-%m-%d").to_string()),
        }));
    }

    Ok(result)
}

/// Check if `me` can manage a specific student.
/// Returns true if `me` is admin (None) or owns at least one class containing the student.
/// Public wrapper that accepts Option<PgPool>.
pub async fn can_manage_student(
    pool: &Option<PgPool>,
    student_id: i64,
    me: Option<i64>,
) -> Result<bool, String> {
    match pool {
        Some(p) => can_manage_student_internal(p, student_id, me).await,
        None => Err("no database configured".to_string()),
    }
}

/// Internal helper for can_manage_student that accepts &PgPool directly.
async fn can_manage_student_internal(
    pool: &PgPool,
    student_id: i64,
    me: Option<i64>,
) -> Result<bool, String> {
    match me {
        None => Ok(true), // Admin can manage anyone
        Some(user_id) => {
            let exists: Option<(i64,)> = sqlx::query_as(
                "SELECT 1::bigint \
                 WHERE EXISTS (SELECT 1 FROM students WHERE id = $1 AND owner_id = $2) \
                 OR EXISTS ( \
                   SELECT 1 FROM class_students cs \
                   INNER JOIN classes c ON cs.class_id = c.id \
                   WHERE cs.student_id = $1 AND c.owner_id = $2 \
                 )"
            )
            .bind(student_id)
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

            Ok(exists.is_some())
        }
    }
}

pub async fn create_student(
    pool: &Option<PgPool>,
    display_name: &str,
    class_ids: &[i64],
    owner_id: i64,
    birthdate: Option<chrono::NaiveDate>,
    pin: &str,
) -> Result<i64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    if !class_ids.is_empty() {
        let count: Option<(i64,)> = sqlx::query_as(
            "SELECT COUNT(*) FROM classes WHERE id = ANY($1) AND owner_id = $2"
        )
        .bind(class_ids)
        .bind(owner_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if count.map(|c| c.0).unwrap_or(0) != class_ids.len() as i64 {
            return Err("permission denied for one or more classes".to_string());
        }
    }

    let student_result = sqlx::query_as::<_, (i64,)>(
        "INSERT INTO students (display_name, owner_id, pin, birthdate) VALUES ($1, $2, $3, $4) RETURNING id"
    )
    .bind(display_name)
    .bind(owner_id)
    .bind(pin)
    .bind(birthdate)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let student_id = student_result.0;

    for class_id in class_ids {
        sqlx::query(
            "INSERT INTO class_students (class_id, student_id, joined_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING"
        )
        .bind(class_id)
        .bind(student_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(student_id)
}

pub async fn class_get_student_pin(
    pool: &Option<PgPool>,
    student_id: i64,
    me: Option<i64>,
) -> Result<Option<String>, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    if !can_manage_student_internal(pool, student_id, me).await? {
        return Err("cannot manage student".to_string());
    }

    let result: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT pin FROM students WHERE id = $1"
    )
    .bind(student_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Some((pin,)) => Ok(pin),
        None => Err("student not found".to_string()),
    }
}

pub async fn class_set_student_pin(
    pool: &Option<PgPool>,
    student_id: i64,
    pin: &str,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    if !can_manage_student_internal(pool, student_id, me).await? {
        return Ok(0);
    }

    let result = sqlx::query(
        "UPDATE students SET pin = $1 WHERE id = $2"
    )
    .bind(pin)
    .bind(student_id)
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

    #[tokio::test]
    async fn new_functions_without_pool_return_err() {
        assert!(super::move_student_to_class(&None, 1, 1, Some(1)).await.is_err());
        assert!(super::remove_student_from_class(&None, 1, 1, Some(1)).await.is_err());
        assert!(super::get_student_classes(&None, 1, Some(1)).await.is_err());
        assert!(super::list_all_students(&None, Some(1)).await.is_err());
        assert!(super::can_manage_student(&None, 1, Some(1)).await.is_err());
    }
}
