use sqlx::PgPool;
use razzoozle_protocol::quizz::{Question, Quizz};

pub async fn create_pool() -> Option<PgPool> {
    match std::env::var("DATABASE_URL") {
        Ok(url) => Some(sqlx::PgPool::connect(&url).await.expect("Failed to connect to DATABASE_URL")),
        Err(_) => None,
    }
}

pub async fn get_manager_password(pool: &Option<PgPool>) -> Option<String> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(Option<String>,)> = sqlx::query_as("SELECT manager_password FROM games_config WHERE id = 1")
        .fetch_optional(pool)
        .await
        .ok()?;

    row.and_then(|(pw,)| pw)
}

/// Load quizzes from the database, keyed by id.
/// Returns a HashMap of (quiz_id -> Quizz).
/// Returns empty map if pool is None or DB query fails.
pub async fn get_quizzes(pool: &Option<PgPool>) -> std::collections::HashMap<String, Quizz> {
    let mut result = std::collections::HashMap::new();

    let pool = match pool {
        Some(p) => p,
        None => return result,
    };

    // The quizzes table has no theme_id column (themes are separate); theme_id stays None.
    let rows: Vec<(String, String, serde_json::Value, Option<bool>)> =
        match sqlx::query_as(
            "SELECT id, subject, questions, archived FROM quizzes WHERE archived = false ORDER BY id"
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

    for (id, subject, questions_json, archived) in rows {
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
            theme_id: None,
        };

        result.insert(id, quiz);
    }

    result
}
