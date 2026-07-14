use sqlx::PgPool;
use razzoozle_protocol::quizz::{Question, Quizz};

/// Load quizzes from the database, keyed by id.
/// Returns a HashMap of (quiz_id -> Quizz).
/// Returns empty map if pool is None or DB query fails.
/// `me`: None = unfiltered (admin / boot reload); Some(id) = only that owner's rows.
pub async fn get_quizzes(
    pool: &Option<PgPool>,
    me: Option<i64>,
) -> std::collections::HashMap<String, Quizz> {
    let mut result = std::collections::HashMap::new();

    let pool = match pool {
        Some(p) => p,
        None => return result,
    };

    // Load all quizzes including archived; theme_id is populated from the column.
    let rows: Vec<(String, String, serde_json::Value, Option<bool>, Option<String>)> =
        match sqlx::query_as(
            "SELECT id, subject, questions, archived, theme_id FROM quizzes \
             WHERE ($1::bigint IS NULL OR owner_id = $1) ORDER BY id"
        )
        .bind(me)
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch quizzes from database: {}", e);
                return result;
            }
        };

    for (id, subject, questions_json, archived, theme_id) in rows {
        // Deserialize questions from JSONB
        let questions: Vec<Question> = match serde_json::from_value(questions_json) {
            Ok(q) => q,
            Err(e) => {
                eprintln!("Failed to deserialize questions for quiz {}: {}", id, e);
                continue;
            }
        };

        let quiz = Quizz {
            subject,
            questions,
            archived,
            theme_id,
        };

        result.insert(id, quiz);
    }

    result
}

/// Load quiz metadata from the database (id, subject, archived, questionCount, labelIds).
/// Efficiently computes question count using jsonb_array_length without deserializing.
/// Batch-aggregates label IDs via LEFT JOIN + array_agg (no N+1).
/// Returns a vector of JSON objects with keys: id, subject, archived, questionCount, labelIds.
/// Results are sorted by id (deterministic ordering, required for consistency).
/// Returns empty vec if pool is None or DB query fails.
/// `me`: None = unfiltered (admin); Some(id) = only that owner's rows.
pub async fn get_quizzes_meta(pool: &Option<PgPool>, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, Option<bool>, i32, Vec<i64>)> =
        match sqlx::query_as(
            "SELECT q.id, q.subject, q.archived, jsonb_array_length(COALESCE(q.questions, '[]')) as question_count, \
             COALESCE(array_agg(ql.label_id) FILTER (WHERE ql.label_id IS NOT NULL), ARRAY[]::bigint[]) as label_ids \
             FROM quizzes q \
             LEFT JOIN quiz_labels ql ON q.id = ql.quiz_id \
             WHERE ($1::bigint IS NULL OR q.owner_id = $1) \
             GROUP BY q.id \
             ORDER BY q.id"
        )
        .bind(me)
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch quiz metadata from database: {}", e);
                return Vec::new();
            }
        };

    let mut result = Vec::new();
    for (id, subject, archived, question_count, label_ids) in rows {
        let quizz_obj = serde_json::json!({
            "id": id,
            "subject": subject,
            "archived": archived.unwrap_or(false),
            "questionCount": question_count,
            "labelIds": label_ids,
        });
        result.push(quizz_obj);
    }

    result
}


/// Upsert a quiz (create or update by id). Takes subject and questions as JSON.
/// Returns Ok(rows_affected) on success (0 = conflict row not owned / no-op), or Err on failure.
/// `owner_id` is stamped on INSERT; not overwritten on conflict (preserves original owner).
/// `me`: None = admin/unguarded DO UPDATE; Some(id) = only update if owner_id matches.
pub async fn upsert_quiz(
    pool: &Option<PgPool>,
    id: &str,
    subject: &str,
    questions: serde_json::Value,
    theme_id: Option<String>,
    owner_id: Option<i64>,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToSave".to_string()),
    };

    let result = sqlx::query(
        "INSERT INTO quizzes (id, subject, questions, archived, theme_id, owner_id) \
         VALUES ($1, $2, $3, false, $4, $5) \
         ON CONFLICT (id) DO UPDATE SET \
             subject = EXCLUDED.subject, \
             questions = EXCLUDED.questions, \
             archived = false, \
             theme_id = EXCLUDED.theme_id, \
             updated_at = now() \
         WHERE ($6::bigint IS NULL OR quizzes.owner_id = $6)",
    )
    .bind(id)
    .bind(subject)
    .bind(questions)
    .bind(theme_id.clone())
    .bind(owner_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Delete a quiz by id. Returns Ok(rows_affected): 0 = not found / not owned.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
pub async fn delete_quiz(pool: &Option<PgPool>, id: &str, me: Option<i64>) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToDelete".to_string()),
    };

    let result = sqlx::query(
        "DELETE FROM quizzes WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)",
    )
    .bind(id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Duplicate a quiz: read source by id, copy to new_id with modified subject.
/// new_subject should be the original subject with " (Kopie)" appended (handled by caller).
/// `archived` is preserved from the source (caller passes it after SELECT).
/// `me` scopes the source SELECT; `owner_id` is stamped on the new row.
/// Returns Ok(new_id) on success, or Err if source not found.
pub async fn duplicate_quiz(
    pool: &Option<PgPool>,
    source_id: &str,
    new_id: &str,
    new_subject: &str,
    archived: bool,
    me: Option<i64>,
    owner_id: Option<i64>,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToSave".to_string()),
    };

    // Fetch source quiz (including theme_id; archived comes from caller)
    let source_row: Option<(serde_json::Value, Option<String>)> =
        sqlx::query_as(
            "SELECT questions, theme_id FROM quizzes \
             WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)",
        )
            .bind(source_id)
            .bind(me)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    let (questions, theme_id) = match source_row {
        Some((q, t)) => (q, t),
        None => return Err("errors:quizz.notFound".to_string()),
    };

    // Insert as new quiz (preserving theme_id + archived from source)
    sqlx::query(
        "INSERT INTO quizzes (id, subject, questions, archived, theme_id, owner_id) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(new_id)
    .bind(new_subject)
    .bind(questions)
    .bind(archived)
    .bind(theme_id.clone())
    .bind(owner_id)
    .execute(pool)
    .await
    .map(|_| new_id.to_string())
    .map_err(|e| e.to_string())
}

/// Return true if a quiz row with the given id exists (optionally owner-scoped).
/// `me`: None = unfiltered (admin); Some(id) = only that owner's rows.
pub async fn quiz_exists(pool: &Option<PgPool>, id: &str, me: Option<i64>) -> bool {
    let pool = match pool {
        Some(p) => p,
        None => return false,
    };

    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM quizzes WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2))",
    )
        .bind(id)
        .bind(me)
        .fetch_one(pool)
        .await
        .unwrap_or(false)
}

/// Update the archived flag on a quiz by id. Returns Ok(rows_affected): 0 = not found / not owned.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
pub async fn update_quiz_archived(
    pool: &Option<PgPool>,
    id: &str,
    archived: bool,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToUpdate".to_string()),
    };

    let result = sqlx::query(
        "UPDATE quizzes SET archived = $1, updated_at = now() \
         WHERE id = $2 AND ($3::bigint IS NULL OR owner_id = $3)",
    )
    .bind(archived)
    .bind(id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Append a question to a quiz. Reads the quiz, appends the question, and writes back.
/// Returns Ok(rows_affected): 0 = not found / not owned.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
pub async fn append_question_to_quiz(
    pool: &Option<PgPool>,
    quiz_id: &str,
    question: &serde_json::Value,
    me: Option<i64>,
) -> Result<u64, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Fetch current quiz (owner-scoped)
    let row: Option<(serde_json::Value,)> = sqlx::query_as(
        "SELECT questions FROM quizzes WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)",
    )
    .bind(quiz_id)
    .bind(me)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut questions = match row {
        Some((qs,)) => match qs.as_array() {
            Some(arr) => arr.clone(),
            None => return Err("Invalid questions format".to_string()),
        },
        None => return Ok(0),
    };

    // Append the new question
    questions.push(question.clone());

    // Update the quiz (owner-scoped)
    let result = sqlx::query(
        "UPDATE quizzes SET questions = $1, updated_at = now() \
         WHERE id = $2 AND ($3::bigint IS NULL OR owner_id = $3)",
    )
    .bind(serde_json::json!(questions))
    .bind(quiz_id)
    .bind(me)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

/// Ownership guard predicate (unit-tested without a live DB).
/// `me = None` (admin) always allows; otherwise row must belong to `me`.
#[cfg(test)]
pub(crate) fn ownership_allows(me: Option<i64>, owner_id: Option<i64>) -> bool {
    match me {
        None => true,
        Some(uid) => owner_id == Some(uid),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ownership_admin_unguarded() {
        assert!(ownership_allows(None, Some(1)));
        assert!(ownership_allows(None, Some(99)));
        assert!(ownership_allows(None, None));
    }

    #[test]
    fn ownership_owner_matches() {
        assert!(ownership_allows(Some(42), Some(42)));
    }

    #[test]
    fn ownership_non_owner_denied() {
        assert!(!ownership_allows(Some(42), Some(7)));
        assert!(!ownership_allows(Some(42), None));
    }

    #[tokio::test]
    async fn mutation_without_pool_returns_err_or_zero() {
        // No DATABASE_URL / pool: mutations must not silently succeed.
        assert!(upsert_quiz(&None, "x", "s", serde_json::json!([]), None, Some(1), Some(1))
            .await
            .is_err());
        assert!(delete_quiz(&None, "x", Some(1)).await.is_err());
        assert!(update_quiz_archived(&None, "x", true, Some(1)).await.is_err());
        assert!(append_question_to_quiz(&None, "x", &serde_json::json!({}), Some(1))
            .await
            .is_err());
    }
}
