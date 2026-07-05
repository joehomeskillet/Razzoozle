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

/// Load media assets from the database.
/// Returns a vector of serde_json objects with the shape matching Node's MediaMeta.
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_media_list(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, String, i32, String, String, String, Option<i32>, Option<i32>, String)> =
        match sqlx::query_as(
            "SELECT id, filename, url, size, type, category, source, width, height, uploaded_at \
             FROM media_assets ORDER BY uploaded_at DESC"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch media_assets from database: {}", e);
                return Vec::new();
            }
        };

    let mut result = Vec::new();

    for (id, filename, url, size, media_type, category, source, width, height, uploaded_at) in rows {
        // Parse the uploaded_at timestamp as RFC3339
        let uploaded_at_rfc3339 = match chrono::DateTime::parse_from_rfc3339(&uploaded_at) {
            Ok(dt) => dt.to_rfc3339(),
            Err(_) => {
                // Fallback: if it's already in a different format, use as-is (shouldn't happen)
                uploaded_at.clone()
            }
        };

        let mut media_obj = serde_json::json!({
            "id": id,
            "filename": filename,
            "url": url,
            "size": size,
            "type": media_type,
            "category": category,
            "source": source,
            "uploadedAt": uploaded_at_rfc3339,
        });

        // Add width only if non-null
        if let Some(w) = width {
            media_obj["width"] = serde_json::json!(w);
        }

        // Add height only if non-null
        if let Some(h) = height {
            media_obj["height"] = serde_json::json!(h);
        }

        result.push(media_obj);
    }

    result
}
