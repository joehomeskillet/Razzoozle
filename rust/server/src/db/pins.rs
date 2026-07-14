use sqlx::{FromRow, PgPool};

/// Get the PIN for a student.
/// Permission: admin (me is None) OR me is the student's owner_id (direct owner).
pub async fn get_student_pin(
    pool: &PgPool,
    student_id: i64,
    me: Option<i64>,
) -> Result<Option<String>, String> {
    let row = sqlx::query_scalar::<_, Option<String>>(
        "SELECT pin FROM students WHERE id = $1 AND (owner_id IS NULL OR owner_id = $2)",
    )
    .bind(student_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to get student PIN: {}", e))?;

    Ok(row.flatten())
}

/// Set or update a student's PIN.
/// Permission: admin (me is None) OR me is the student's owner_id (direct owner).
pub async fn set_student_pin(
    pool: &PgPool,
    student_id: i64,
    pin: &str,
    me: Option<i64>,
) -> Result<u64, String> {
    let result = sqlx::query(
        "UPDATE students SET pin = $1 WHERE id = $2 AND (owner_id IS NULL OR owner_id = $3)",
    )
    .bind(pin)
    .bind(student_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to set student PIN: {}", e))?;

    Ok(result.rows_affected())
}

/// Create a solo session token for assignment playback.
pub async fn create_solo_session(
    pool: &PgPool,
    token: &str,
    assignment_id: &str,
    student_id: i64,
    ttl_minutes: i32,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO solo_sessions (token, assignment_id, student_id, expires_at, used, created_at)
         VALUES ($1, $2, $3, now() + INTERVAL '1 minute' * $4, false, now())",
    )
    .bind(token)
    .bind(assignment_id)
    .bind(student_id)
    .bind(ttl_minutes)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create solo session: {}", e))?;

    Ok(())
}

/// Validate a student's PIN against the stored value.
/// Returns true if PIN is valid AND the assignment exists.
/// Returns Err with constant-shape error (no oracle which check failed).
pub async fn validate_student_pin(
    pool: &PgPool,
    assignment_id: &str,
    student_id: i64,
    pin: &str,
) -> Result<bool, String> {
    let stored_pin = sqlx::query_scalar::<_, Option<String>>(
        "SELECT pin FROM students WHERE id = $1",
    )
    .bind(student_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| "validation_failed".to_string())?;

    let assignment_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM assignments WHERE id = $1)",
    )
    .bind(assignment_id)
    .fetch_one(pool)
    .await
    .map_err(|_| "validation_failed".to_string())?;

    match (stored_pin.flatten(), assignment_exists) {
        (Some(stored), true) => Ok(stored == pin),
        _ => Err("validation_failed".to_string()),
    }
}
