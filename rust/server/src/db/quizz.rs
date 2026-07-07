use sqlx::PgPool;
use razzoozle_protocol::quizz::{Question, Quizz};

/// Load quizzes from the database, keyed by id.
/// Returns a HashMap of (quiz_id -> Quizz).
/// Returns empty map if pool is None or DB query fails.
pub async fn get_quizzes(pool: &Option<PgPool>) -> std::collections::HashMap<String, Quizz> {
    let mut result = std::collections::HashMap::new();

    let pool = match pool {
        Some(p) => p,
        None => return result,
    };

    // Load all quizzes including archived; theme_id is populated from the column.
    let rows: Vec<(String, String, serde_json::Value, Option<bool>, Option<String>)> =
        match sqlx::query_as(
            "SELECT id, subject, questions, archived, theme_id FROM quizzes ORDER BY id"
        )
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

/// Upsert a quiz (create or update by id). Takes subject and questions as JSON.
/// Returns Ok(id) on success, or Err with a descriptive message.
pub async fn upsert_quiz(
    pool: &Option<PgPool>,
    id: &str,
    subject: &str,
    questions: serde_json::Value,
    theme_id: Option<String>,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToSave".to_string()),
    };

    sqlx::query(
        "INSERT INTO quizzes (id, subject, questions, archived, theme_id) \
         VALUES ($1, $2, $3, false, $4) \
         ON CONFLICT (id) DO UPDATE SET \
             subject = EXCLUDED.subject, \
             questions = EXCLUDED.questions, \
             archived = false, \
             theme_id = EXCLUDED.theme_id, \
             updated_at = now()",
    )
    .bind(id)
    .bind(subject)
    .bind(questions)
    .bind(theme_id.clone())
    .execute(pool)
    .await
    .map(|_| id.to_string())
    .map_err(|e| e.to_string())
}

/// Delete a quiz by id. Returns Ok(()) on success, or Err if not found.
pub async fn delete_quiz(pool: &Option<PgPool>, id: &str) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToDelete".to_string()),
    };

    let result = sqlx::query("DELETE FROM quizzes WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("Quizz \"{}\" not found", id));
    }

    Ok(())
}

/// Duplicate a quiz: read source by id, copy to new_id with modified subject.
/// new_subject should be the original subject with " (Kopie)" appended (handled by caller).
/// Returns Ok(new_id) on success, or Err if source not found.
pub async fn duplicate_quiz(
    pool: &Option<PgPool>,
    source_id: &str,
    new_id: &str,
    new_subject: &str,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToSave".to_string()),
    };

    // Fetch source quiz (including theme_id)
    let source_row: Option<(serde_json::Value, Option<String>)> =
        sqlx::query_as("SELECT questions, theme_id FROM quizzes WHERE id = $1")
            .bind(source_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    let (questions, theme_id) = match source_row {
        Some((q, t)) => (q, t),
        None => return Err("errors:quizz.notFound".to_string()),
    };

    // Insert as new quiz (preserving theme_id)
    sqlx::query(
        "INSERT INTO quizzes (id, subject, questions, archived, theme_id) \
         VALUES ($1, $2, $3, false, $4)",
    )
    .bind(new_id)
    .bind(new_subject)
    .bind(questions)
    .bind(theme_id.clone())
    .execute(pool)
    .await
    .map(|_| new_id.to_string())
    .map_err(|e| e.to_string())
}

/// Update the archived flag on a quiz by id. Returns Ok(()) on success, or Err if not found.
pub async fn update_quiz_archived(
    pool: &Option<PgPool>,
    id: &str,
    archived: bool,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:quizz.failedToUpdate".to_string()),
    };

    let result = sqlx::query("UPDATE quizzes SET archived = $1, updated_at = now() WHERE id = $2")
        .bind(archived)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err("errors:quizz.notFound".to_string());
    }

    Ok(())
}

/// Append a question to a quiz. Reads the quiz, appends the question, and writes back.
pub async fn append_question_to_quiz(
    pool: &Option<PgPool>,
    quiz_id: &str,
    question: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Fetch current quiz
    let row: Option<(serde_json::Value,)> = sqlx::query_as(
        "SELECT questions FROM quizzes WHERE id = $1"
    )
    .bind(quiz_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut questions = match row {
        Some((qs,)) => {
            match qs.as_array() {
                Some(arr) => arr.clone(),
                None => return Err("Invalid questions format".to_string()),
            }
        }
        None => return Err(format!("Quiz \"{}\" not found", quiz_id)),
    };

    // Append the new question
    questions.push(question.clone());

    // Update the quiz
    sqlx::query(
        "UPDATE quizzes SET questions = $1, updated_at = now() WHERE id = $2"
    )
    .bind(serde_json::json!(questions))
    .bind(quiz_id)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

