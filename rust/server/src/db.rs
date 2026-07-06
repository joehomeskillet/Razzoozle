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

/// Load a single game result by id (for results:get / results:getShared).
/// Returns {id, subject, date, players} matching the SharedResult / result-detail
/// shape, or None if the id is absent or pool is None.
pub async fn get_result_by_id(pool: &Option<PgPool>, id: &str) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(String, String, chrono::DateTime<chrono::Utc>, serde_json::Value)> =
        sqlx::query_as("SELECT id, subject, date, players FROM game_results WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    row.map(|(id, subject, date, players)| {
        serde_json::json!({
            "id": id,
            "subject": subject,
            "date": date.to_rfc3339(),
            "players": players,
        })
    })
}

/// Load submissions with the FULL question OBJECT (not the preview string) for the
/// Suggestions moderation panel (manager:submissionsData). Shape mirrors Node's
/// Submission: {id, submittedBy, submittedAt, status, question}.
pub async fn get_submissions_full(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<String>, String, serde_json::Value, chrono::DateTime<chrono::Utc>)> =
        match sqlx::query_as(
            "SELECT id, submitted_by, status, question, submitted_at \
             FROM submissions ORDER BY submitted_at DESC",
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("Failed to fetch submissions (full): {}", e);
                return Vec::new();
            }
        };

    rows.into_iter()
        .map(|(id, submitted_by, status, question, submitted_at)| {
            serde_json::json!({
                "id": id,
                "submittedBy": submitted_by,
                "submittedAt": submitted_at.to_rfc3339(),
                "status": status,
                "question": question,
            })
        })
        .collect()
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

/// Count pending submissions — flood cap for the public unauthenticated submit
/// path. Returns 0 if the pool is None or the query fails (fail-open).
pub async fn count_pending_submissions(pool: &Option<PgPool>) -> i64 {
    let pool = match pool {
        Some(p) => p,
        None => return 0,
    };

    let row: Option<(i64,)> =
        sqlx::query_as("SELECT count(*) FROM submissions WHERE status = 'pending'")
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    row.map(|(c,)| c).unwrap_or(0)
}

/// Persist a public question submission (status 'pending') into the shared DB.
/// Upserts by id so a re-submitted identical question overwrites rather than
/// duplicating (mirrors Node's slug-id save). Returns Err on DB failure.
pub async fn insert_submission(
    pool: &Option<PgPool>,
    id: &str,
    submitted_by: &str,
    question: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    sqlx::query(
        "INSERT INTO submissions (id, status, submitted_by, submitted_at, question, source) \
         VALUES ($1, 'pending', $2, now(), $3, 'submission') \
         ON CONFLICT (id) DO UPDATE SET \
             status = 'pending', \
             submitted_by = EXCLUDED.submitted_by, \
             submitted_at = now(), \
             question = EXCLUDED.question, \
             updated_at = now()",
    )
    .bind(id)
    .bind(submitted_by)
    .bind(question)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Upsert a quiz (create or update by id). Takes subject and questions as JSON.
/// Returns Ok(id) on success, or Err with a descriptive message.
pub async fn upsert_quiz(
    pool: &Option<PgPool>,
    id: &str,
    subject: &str,
    questions: serde_json::Value,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    sqlx::query(
        "INSERT INTO quizzes (id, subject, questions, archived) \
         VALUES ($1, $2, $3, false) \
         ON CONFLICT (id) DO UPDATE SET \
             subject = EXCLUDED.subject, \
             questions = EXCLUDED.questions, \
             updated_at = now()",
    )
    .bind(id)
    .bind(subject)
    .bind(questions)
    .execute(pool)
    .await
    .map(|_| id.to_string())
    .map_err(|e| e.to_string())
}

/// Delete a quiz by id. Returns Ok(()) on success, or Err if not found.
pub async fn delete_quiz(pool: &Option<PgPool>, id: &str) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
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
        None => return Err("no database configured".to_string()),
    };

    // Fetch source quiz
    let source_row: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT questions FROM quizzes WHERE id = $1")
            .bind(source_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    let questions = match source_row {
        Some((q,)) => q,
        None => return Err(format!("Quizz \"{}\" not found", source_id)),
    };

    // Insert as new quiz
    sqlx::query(
        "INSERT INTO quizzes (id, subject, questions, archived) \
         VALUES ($1, $2, $3, false)",
    )
    .bind(new_id)
    .bind(new_subject)
    .bind(questions)
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
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query("UPDATE quizzes SET archived = $1, updated_at = now() WHERE id = $2")
        .bind(archived)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("Quizz \"{}\" not found", id));
    }

    Ok(())
}
