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

    let rows: Vec<(String, String, String, i32, String, String, String, Option<i32>, Option<i32>, chrono::DateTime<chrono::Utc>)> =
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
        // uploaded_at is a TIMESTAMPTZ decoded into DateTime<Utc>; emit as RFC3339.
        let uploaded_at_rfc3339 = uploaded_at.to_rfc3339();

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

/// Load game results metadata from the database.
/// Returns a vector of serde_json objects with GameResultMeta shape.
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_results(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, chrono::DateTime<chrono::Utc>, serde_json::Value)> =
        match sqlx::query_as(
            "SELECT id, subject, date, players FROM game_results ORDER BY date DESC"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch game_results from database: {}", e);
                return Vec::new();
            }
        };

    let mut result = Vec::new();
    for (id, subject, date, players) in rows {
        let player_count = players.as_array().map(|a| a.len()).unwrap_or(0);
        let result_obj = serde_json::json!({
            "id": id,
            "subject": subject,
            "date": date.to_rfc3339(),
            "playerCount": player_count,
        });
        result.push(result_obj);
    }

    result
}

/// Load submissions from the database.
/// Returns a vector of serde_json objects with SubmissionMeta shape (or array of submission objects).
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_submissions(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<String>, String, serde_json::Value, chrono::DateTime<chrono::Utc>)> =
        match sqlx::query_as(
            "SELECT id, submitted_by, status, question, submitted_at \
             FROM submissions ORDER BY submitted_at DESC"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch submissions from database: {}", e);
                return Vec::new();
            }
        };

    let mut result = Vec::new();
    for (id, submitted_by, status, question, submitted_at) in rows {
        // SubmissionMeta.question is a STRING (the question text preview), not the full
        // Question object — the manager Suggestions list renders it directly, so sending
        // the object triggers React #31 ("objects are not valid as a child").
        let question_text = question
            .get("question")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let submission_obj = serde_json::json!({
            "id": id,
            "submittedBy": submitted_by,
            "submittedAt": submitted_at.to_rfc3339(),
            "status": status,
            "question": question_text,
        });
        result.push(submission_obj);
    }

    result
}

/// Load theme templates from the database.
/// Returns a vector of serde_json objects with ThemeTemplateMeta shape (id, name).
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_themes(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String)> =
        match sqlx::query_as(
            "SELECT id, name FROM themes ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch theme_templates from database: {}", e);
                return Vec::new();
            }
        };

    let result = rows.into_iter()
        .map(|(id, name)| serde_json::json!({"id": id, "name": name}))
        .collect();

    result
}

/// Load achievements configuration from the database.
/// Returns a vector of serde_json objects with achievement config shape.
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_achievements(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<bool>, Option<String>, Option<String>, Option<i32>)> =
        match sqlx::query_as(
            "SELECT id, enabled, name, description, threshold FROM achievements_config ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch achievements_config from database: {}", e);
                return Vec::new();
            }
        };

    let result = rows.into_iter()
        .map(|(id, enabled, name, description, threshold)| {
            let mut obj = serde_json::json!({"id": id});
            if let Some(e) = enabled {
                obj["enabled"] = serde_json::json!(e);
            }
            if let Some(n) = name {
                obj["name"] = serde_json::json!(n);
            }
            if let Some(d) = description {
                obj["description"] = serde_json::json!(d);
            }
            if let Some(t) = threshold {
                obj["threshold"] = serde_json::json!(t);
            }
            obj
        })
        .collect();

    result
}

/// Load installed plugins from the database.
/// Returns a vector of serde_json objects with InstalledPlugin shape.
/// Returns empty vec if pool is None or DB query fails.
pub async fn get_plugins(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, String, bool, serde_json::Value, Option<serde_json::Value>)> =
        match sqlx::query_as(
            "SELECT id, name, version, enabled, capabilities, config FROM installed_plugins ORDER BY id"
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch installed_plugins from database: {}", e);
                return Vec::new();
            }
        };

    let result = rows.into_iter()
        .map(|(id, name, version, enabled, capabilities, config)| {
            let mut obj = serde_json::json!({
                "id": id,
                "name": name,
                "version": version,
                "enabled": enabled,
                "capabilities": capabilities,
            });
            if let Some(cfg) = config {
                obj["config"] = cfg;
            }
            obj
        })
        .collect();

    result
}

/// Load game configuration from the database.
/// Returns team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode.
/// Returns None for all fields if pool is None or DB query fails.
pub async fn get_game_config(pool: &Option<PgPool>) -> (Option<bool>, Option<bool>, Option<bool>, Option<bool>, Option<String>) {
    let pool = match pool {
        Some(p) => p,
        None => return (None, None, None, None, None),
    };

    let row: Option<(Option<bool>, Option<bool>, Option<bool>, Option<bool>, Option<String>)> =
        sqlx::query_as(
            "SELECT team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode \
             FROM games_config WHERE id = 1"
        )
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    row.unwrap_or((None, None, None, None, None))
}
