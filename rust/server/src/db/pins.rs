use sqlx::{FromRow, PgPool};


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
/// Returns true if PIN is valid, the student is active, AND the assignment exists.
/// Inactive students return Ok(false) — same shape as wrong PIN (no info leak).
/// Returns Err with constant-shape error (no oracle which check failed).
pub async fn validate_student_pin(
    pool: &PgPool,
    assignment_id: &str,
    student_id: i64,
    pin: &str,
) -> Result<bool, String> {
    let row: Option<(Option<String>, bool)> = sqlx::query_as(
        "SELECT pin, active FROM students WHERE id = $1",
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

    match (row, assignment_exists) {
        (Some((Some(stored), true)), true) => Ok(stored == pin),
        // Inactive student: same shape as wrong PIN (Ok(false)), no oracle.
        (Some((_, false)), true) => Ok(false),
        (Some((None, true)), true) => Ok(false),
        _ => Err("validation_failed".to_string()),
    }
}


/// Wave-1 §B: Fetch students in a class WITH stored PINs for klassen login validation.
/// Returns (id, display_name, stored_pin, active) tuples. PINs are required for credential checking.
/// Scoped to class_id + owner_id (class.owner_id) for authorization.
/// Includes inactive students so callers can reject with the same shape as wrong PIN.
pub async fn students_with_pins(
    pool: &Option<PgPool>,
    class_id: i64,
    owner_id: i64,
) -> Vec<(i64, String, String, bool)> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(i64, String, String, bool)> = match sqlx::query_as(
        "SELECT s.id, s.display_name, COALESCE(s.pin, ''), s.active FROM students s \
         INNER JOIN class_students cs ON s.id = cs.student_id \
         INNER JOIN classes c ON cs.class_id = c.id \
         WHERE cs.class_id = $1 AND c.owner_id = $2 \
         ORDER BY s.display_name ASC",
    )
    .bind(class_id)
    .bind(owner_id)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    rows
}
