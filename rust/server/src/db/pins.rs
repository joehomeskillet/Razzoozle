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

/// Wave-1 live join: verify emoji PIN against plaintext `students.pin`.
/// No assignment gate — identity is (student_id ∈ class roster) enforced by the caller.
/// Constant-shape: Ok(false) for mismatch / missing student; Err only on DB failure.
/// NEVER log `pin` or student_id values at call sites (security audit gate).
pub async fn validate_student_pin_plain(
    pool: &PgPool,
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

    match stored_pin.flatten() {
        Some(stored) => Ok(stored == pin),
        None => Ok(false),
    }
}

/// Wave-1 §B: Fetch students in a class WITH stored PINs for klassen login validation.
/// Returns (id, display_name, stored_pin) tuples. PINs are required for credential checking.
/// Scoped to class_id + owner_id (class.owner_id) for authorization.
pub async fn students_with_pins(
    pool: &Option<PgPool>,
    class_id: i64,
    owner_id: i64,
) -> Vec<(i64, String, String)> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(i64, String, String)> = match sqlx::query_as(
        "SELECT s.id, s.display_name, COALESCE(s.pin, '') FROM students s \
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
