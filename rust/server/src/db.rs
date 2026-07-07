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
/// Returns {id, subject, date, players, recap?} matching the SharedResult / result-detail
/// shape, or None if the id is absent or pool is None.
pub async fn get_result_by_id(pool: &Option<PgPool>, id: &str) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(String, String, chrono::DateTime<chrono::Utc>, serde_json::Value, Option<serde_json::Value>)> =
        sqlx::query_as("SELECT id, subject, date, players, recap FROM game_results WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    row.map(|(id, subject, date, players, recap)| {
        let mut obj = serde_json::json!({
            "id": id,
            "subject": subject,
            "date": date.to_rfc3339(),
            "players": players,
        });
        if let Some(recap_val) = recap {
            obj["recap"] = recap_val;
        }
        obj
    })
}

/// Load submissions with the FULL question OBJECT (not the preview string) for the
/// Suggestions moderation panel (manager:submissionsData). Includes rejectionReason and category.
/// Shape mirrors Node's Submission: {id, submittedBy, submittedAt, status, question, rejectionReason?, category?}.
pub async fn get_submissions_full(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<String>, String, serde_json::Value, chrono::DateTime<chrono::Utc>, Option<String>, Option<String>)> =
        match sqlx::query_as(
            "SELECT id, submitted_by, status, question, submitted_at, rejection_reason, category \
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
        .map(|(id, submitted_by, status, question, submitted_at, rejection_reason, category)| {
            let mut obj = serde_json::json!({
                "id": id,
                "submittedBy": submitted_by,
                "submittedAt": submitted_at.to_rfc3339(),
                "status": status,
                "question": question,
            });
            if let Some(rr) = rejection_reason {
                obj["rejectionReason"] = serde_json::json!(rr);
            }
            if let Some(cat) = category {
                obj["category"] = serde_json::json!(cat);
            }
            obj
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

/// Update game config with a partial patch. Deep-merges into existing row.
/// Fields: team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode.
/// Only updates fields that are Some; omitted fields (None) are left unchanged.
pub async fn update_game_config(
    pool: &Option<PgPool>,
    patch: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Extract optional fields from the patch
    let team_mode = patch.get("teamMode").and_then(|v| v.as_bool());
    let low_latency_enabled = patch.get("lowLatencyEnabled").and_then(|v| v.as_bool());
    let join_locked = patch.get("joinLocked").and_then(|v| v.as_bool());
    let randomize_answers = patch.get("randomizeAnswers").and_then(|v| v.as_bool());
    let scoring_mode = patch.get("scoringMode").and_then(|v| v.as_str());

    // Build the UPDATE statement dynamically — only touch fields that are present
    let mut query_str = "UPDATE games_config SET ".to_string();
    let mut updates = Vec::new();
    let mut idx = 1;

    if team_mode.is_some() {
        updates.push(format!("team_mode = ${}", idx));
        idx += 1;
    }
    if low_latency_enabled.is_some() {
        updates.push(format!("low_latency_enabled = ${}", idx));
        idx += 1;
    }
    if join_locked.is_some() {
        updates.push(format!("join_locked = ${}", idx));
        idx += 1;
    }
    if randomize_answers.is_some() {
        updates.push(format!("randomize_answers = ${}", idx));
        idx += 1;
    }
    if scoring_mode.is_some() {
        updates.push(format!("scoring_mode = ${}", idx));
        idx += 1;
    }

    if updates.is_empty() {
        // No fields to update — silent no-op (consistent with Node)
        return Ok(());
    }

    updates.push(format!("updated_at = now()"));
    query_str.push_str(&updates.join(", "));
    query_str.push_str(" WHERE id = 1");

    let mut query = sqlx::query(&query_str);

    if let Some(tm) = team_mode {
        query = query.bind(tm);
    }
    if let Some(lle) = low_latency_enabled {
        query = query.bind(lle);
    }
    if let Some(jl) = join_locked {
        query = query.bind(jl);
    }
    if let Some(ra) = randomize_answers {
        query = query.bind(ra);
    }
    if let Some(sm) = scoring_mode {
        query = query.bind(sm);
    }

    query
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Update achievements config with a partial patch. Deep-merges by id.
/// Each key in the patch is an achievement id; the value is a partial override
/// that is merged with the existing record (if any).
pub async fn update_achievements_config(
    pool: &Option<PgPool>,
    patch: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let patch_obj = match patch.as_object() {
        Some(obj) => obj,
        None => return Ok(()), // Non-object patch is a silent no-op
    };

    // Iterate over each achievement id in the patch
    for (id, override_val) in patch_obj {
        let enabled = override_val.get("enabled").and_then(|v| v.as_bool());
        let name = override_val.get("name").and_then(|v| v.as_str());
        let description = override_val.get("description").and_then(|v| v.as_str());
        let threshold = override_val.get("threshold").and_then(|v| v.as_i64()).map(|v| v as i32);

        // UPSERT: if the row exists, update only the non-None fields; if it doesn't, insert
        sqlx::query(
            "INSERT INTO achievements_config (id, enabled, name, description, threshold) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (id) DO UPDATE SET \
                enabled = COALESCE(EXCLUDED.enabled, achievements_config.enabled), \
                name = COALESCE(EXCLUDED.name, achievements_config.name), \
                description = COALESCE(EXCLUDED.description, achievements_config.description), \
                threshold = COALESCE(EXCLUDED.threshold, achievements_config.threshold)"
        )
        .bind(id)
        .bind(enabled)
        .bind(name)
        .bind(description)
        .bind(threshold)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Update a submission with a partial patch.
/// Only updates fields that are present in the patch (status, rejectionReason, category, question).
pub async fn insert_catalog_entry(
    pool: &Option<PgPool>,
    question: &serde_json::Value,
    source: &str,
) -> Result<String, String> {
    insert_catalog_entry_with_tags(pool, question, source, &serde_json::json!([])).await
}

/// Same as `insert_catalog_entry` but also persists `tags` (defaults to `[]`
/// when the caller has none, e.g. the submission-approve path).
pub async fn insert_catalog_entry_with_tags(
    pool: &Option<PgPool>,
    question: &serde_json::Value,
    source: &str,
    tags: &serde_json::Value,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    // Extract the question text to derive the id
    let question_text = question
        .get("question")
        .and_then(|v| v.as_str())
        .unwrap_or("untitled");

    // Normalize the question text to an id (lowercase, hyphens, no special chars)
    let base_id = question_text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|seg| !seg.is_empty())
        .collect::<Vec<&str>>()
        .join("-");

    // Check for existing entries and deduplicate with -2, -3 suffix
    let mut id = base_id.clone();
    let mut suffix = 2;

    loop {
        let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM catalog_entries WHERE id = $1")
            .bind(&id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

        if existing.is_none() {
            break;
        }

        id = format!("{}-{}", base_id, suffix);
        suffix += 1;
    }

    // Insert the catalog entry
    sqlx::query(
        "INSERT INTO catalog_entries (id, question, tags, source, added_at) VALUES ($1, $2, $3, $4, now())"
    )
    .bind(&id)
    .bind(question)
    .bind(tags)
    .bind(source)
    .execute(pool)
    .await
    .map(|_| id)
    .map_err(|e| e.to_string())
}

/// Update submission with a partial patch. Only updates fields present in the patch.
/// Supports: status, rejectionReason, category, question.
pub async fn update_submission(
    pool: &Option<PgPool>,
    id: &str,
    patch: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let patch_obj = patch.as_object().ok_or("patch must be an object")?;

    if patch_obj.is_empty() {
        return Ok(()); // Nothing to update
    }

    // Build a simple SQL query for each field; chain multiple updates if needed
    let mut updates = Vec::new();

    if let Some(status) = patch_obj.get("status").and_then(|v| v.as_str()) {
        updates.push((
            "UPDATE submissions SET status = $1, updated_at = now() WHERE id = $2",
            status.to_string(),
        ));
    }

    if let Some(reason) = patch_obj.get("rejectionReason").and_then(|v| v.as_str()) {
        updates.push((
            "UPDATE submissions SET rejection_reason = $1, updated_at = now() WHERE id = $2",
            reason.to_string(),
        ));
    }

    if let Some(category) = patch_obj.get("category").and_then(|v| v.as_str()) {
        updates.push((
            "UPDATE submissions SET category = $1, updated_at = now() WHERE id = $2",
            category.to_string(),
        ));
    }

    if let Some(question) = patch_obj.get("question") {
        // For question, we need to handle JSON differently
        sqlx::query(
            "UPDATE submissions SET question = $1, updated_at = now() WHERE id = $2"
        )
        .bind(question)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Execute non-JSON updates
    for (query_str, value) in updates {
        sqlx::query(query_str)
            .bind(&value)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Fetch a submission by id. Returns the full submission including question, rejectionReason, and category.
pub async fn get_submission_by_id(
    pool: &Option<PgPool>,
    id: &str,
) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(String, Option<String>, String, serde_json::Value, chrono::DateTime<chrono::Utc>, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT id, submitted_by, status, question, submitted_at, rejection_reason, category FROM submissions WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    row.map(|(id, submitted_by, status, question, submitted_at, rejection_reason, category)| {
        let mut obj = serde_json::json!({
            "id": id,
            "submittedBy": submitted_by,
            "submittedAt": submitted_at.to_rfc3339(),
            "status": status,
            "question": question,
        });
        if let Some(rr) = rejection_reason {
            obj["rejectionReason"] = serde_json::json!(rr);
        }
        if let Some(cat) = category {
            obj["category"] = serde_json::json!(cat);
        }
        obj
    })
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

/// Fetch all catalog entries as an array of JSON objects (matches the
/// Node `CatalogEntry` shape: id, question, tags, source, addedAt).
pub async fn get_catalog(pool: &Option<PgPool>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return vec![],
    };

    let rows: Vec<(String, serde_json::Value, serde_json::Value, Option<String>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
        "SELECT id, question, tags, source, added_at FROM catalog_entries ORDER BY added_at DESC"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    rows.iter()
        .map(|(id, question, tags, source, added_at)| {
            serde_json::json!({
                "id": id,
                "question": question,
                "tags": tags,
                "source": source,
                "addedAt": added_at.map(|t| t.to_rfc3339()),
            })
        })
        .collect()
}

/// Update a catalog entry's question + tags fields. Returns Err if entry not found.
pub async fn update_catalog_entry(
    pool: &Option<PgPool>,
    id: &str,
    question: &serde_json::Value,
    tags: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query("UPDATE catalog_entries SET question = $1, tags = $2 WHERE id = $3")
        .bind(question)
        .bind(tags)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err("errors:catalog.notFound".to_string());
    }

    Ok(())
}

/// Delete a catalog entry by id. Returns Err if entry not found.
pub async fn delete_catalog_entry(
    pool: &Option<PgPool>,
    id: &str,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    let result = sqlx::query("DELETE FROM catalog_entries WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err("errors:catalog.notFound".to_string());
    }

    Ok(())
}

/// Fetch the active theme (currently stored in a dedicated table or config).
pub async fn get_theme(pool: &Option<PgPool>) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(serde_json::Value,)> = sqlx::query_as(
        "SELECT theme_data FROM themes WHERE id = 'active' LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    row.map(|(theme_data,)| theme_data)
}

/// Save the active theme to the database (upsert).
pub async fn upsert_theme(
    pool: &Option<PgPool>,
    theme_data: &serde_json::Value,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    sqlx::query(
        "INSERT INTO themes (id, theme_data, updated_at) VALUES ('active', $1, now()) \
         ON CONFLICT (id) DO UPDATE SET theme_data = $1, updated_at = now()"
    )
    .bind(theme_data)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Insert a new game result with full player data and optional recap.
/// Returns Ok(id) on success, or Err on database failure.
pub async fn insert_result(
    pool: &Option<PgPool>,
    id: &str,
    quiz_id: Option<&str>,
    subject: &str,
    date: chrono::DateTime<chrono::Utc>,
    players: &serde_json::Value,
    recap: Option<&serde_json::Value>,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:result.failedToSave".to_string()),
    };

    sqlx::query(
        "INSERT INTO game_results (id, quiz_id, subject, date, players, recap) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(quiz_id)
    .bind(subject)
    .bind(date)
    .bind(players)
    .bind(recap)
    .execute(pool)
    .await
    .map(|_| id.to_string())
    .map_err(|e| e.to_string())
}

pub async fn delete_result(pool: &Option<PgPool>, id: &str) -> bool {
    let pool = match pool {
        Some(p) => p,
        None => return false,
    };

    match sqlx::query("DELETE FROM game_results WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
    {
        Ok(result) => result.rows_affected() > 0,
        Err(_) => false,
    }
}
