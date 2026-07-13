use sqlx::PgPool;

/// Load submissions with the FULL question OBJECT (not the preview string) for the
/// Suggestions moderation panel (manager:submissionsData). Includes rejectionReason and category.
/// Shape mirrors Node's Submission: {id, submittedBy, submittedAt, status, question, rejectionReason?, category?}.
/// `me`: None = unfiltered (admin); Some(id) = only that owner's rows.
pub async fn get_submissions_full(
    pool: &Option<PgPool>,
    me: Option<i64>,
) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<String>, String, serde_json::Value, chrono::DateTime<chrono::Utc>, Option<String>, Option<String>)> =
        match sqlx::query_as(
            "SELECT id, submitted_by, status, question, submitted_at, rejection_reason, category \
             FROM submissions WHERE ($1::bigint IS NULL OR owner_id = $1) \
             ORDER BY submitted_at DESC",
        )
        .bind(me)
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
                "submittedAt": submitted_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
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
/// `me`: None = unfiltered (admin); Some(id) = only that owner's rows.
pub async fn get_submissions(pool: &Option<PgPool>, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, Option<String>, String, serde_json::Value, chrono::DateTime<chrono::Utc>)> =
        match sqlx::query_as(
            "SELECT id, submitted_by, status, question, submitted_at \
             FROM submissions WHERE ($1::bigint IS NULL OR owner_id = $1) \
             ORDER BY submitted_at DESC"
        )
        .bind(me)
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
            "submittedAt": submitted_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "status": status,
            "question": question_text,
        });
        result.push(submission_obj);
    }

    result
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
///
/// `category` is optional (WP-17 public topic); when `None` the column stays NULL.
/// `owner_id` stamps the receiving manager (from submit_token) when known.
pub async fn insert_submission(
    pool: &Option<PgPool>,
    id: &str,
    submitted_by: &str,
    question: &serde_json::Value,
    category: Option<&str>,
    owner_id: Option<i64>,
) -> Result<(), String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("no database configured".to_string()),
    };

    sqlx::query(
        "INSERT INTO submissions (id, status, submitted_by, submitted_at, question, source, category, owner_id) \
         VALUES ($1, 'pending', $2, now(), $3, 'submission', $4, $5) \
         ON CONFLICT (id) DO UPDATE SET \
             status = 'pending', \
             submitted_by = EXCLUDED.submitted_by, \
             submitted_at = now(), \
             question = EXCLUDED.question, \
             category = EXCLUDED.category, \
             owner_id = COALESCE(EXCLUDED.owner_id, submissions.owner_id), \
             updated_at = now()",
    )
    .bind(id)
    .bind(submitted_by)
    .bind(question)
    .bind(category)
    .bind(owner_id)
    .execute(pool)
    .await
    .map(|_| ())
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
/// `me`: None = unfiltered (admin); Some(id) = only that owner's rows.
pub async fn get_submission_by_id(
    pool: &Option<PgPool>,
    id: &str,
    me: Option<i64>,
) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(String, Option<String>, String, serde_json::Value, chrono::DateTime<chrono::Utc>, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT id, submitted_by, status, question, submitted_at, rejection_reason, category \
             FROM submissions WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)"
        )
        .bind(id)
        .bind(me)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    row.map(|(id, submitted_by, status, question, submitted_at, rejection_reason, category)| {
        let mut obj = serde_json::json!({
            "id": id,
            "submittedBy": submitted_by,
            "submittedAt": submitted_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
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
