use sqlx::PgPool;

/// Load game results metadata from the database.
/// Returns a vector of serde_json objects with GameResultMeta shape.
/// Returns empty vec if pool is None or DB query fails.
/// `me`: None = unfiltered (admin); Some(id) = only that owner's rows.
pub async fn get_results(pool: &Option<PgPool>, me: Option<i64>) -> Vec<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows: Vec<(String, String, chrono::DateTime<chrono::Utc>, serde_json::Value)> =
        match sqlx::query_as(
            "SELECT id, subject, date, players FROM game_results \
             WHERE ($1::bigint IS NULL OR owner_id = $1) ORDER BY date DESC"
        )
        .bind(me)
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
            "date": date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "playerCount": player_count,
        });
        result.push(result_obj);
    }

    result
}

/// Load a single game result by id (for results:get / results:getShared).
/// Returns {id, subject, date, players, questions, recap?} matching the SharedResult / result-detail
/// shape, or None if the id is absent or pool is None.
/// `me`: None = unfiltered (admin / public share); Some(id) = only that owner's rows.
pub async fn get_result_by_id(
    pool: &Option<PgPool>,
    id: &str,
    me: Option<i64>,
) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(String, String, chrono::DateTime<chrono::Utc>, serde_json::Value, Option<serde_json::Value>, Option<serde_json::Value>)> =
        sqlx::query_as(
            "SELECT id, subject, date, players, questions, recap FROM game_results \
             WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)",
        )
            .bind(id)
            .bind(me)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    row.map(|(id, subject, date, players, questions, recap)| {
        let mut obj = serde_json::json!({
            "id": id,
            "subject": subject,
            "date": date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "players": players,
            "questions": questions.unwrap_or_else(|| serde_json::json!([])),
        });
        if let Some(recap_val) = recap {
            obj["recap"] = recap_val;
        }
        obj
    })
}

/// Insert a new game result with full player data, questions history, and optional recap.
/// Returns Ok(id) on success, or Err on database failure.
pub async fn insert_result(
    pool: &Option<PgPool>,
    id: &str,
    quiz_id: Option<&str>,
    subject: &str,
    date: chrono::DateTime<chrono::Utc>,
    players: &serde_json::Value,
    questions: Option<&serde_json::Value>,
    recap: Option<&serde_json::Value>,
    owner_id: Option<i64>,
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:result.failedToSave".to_string()),
    };

    sqlx::query(
        "INSERT INTO game_results (id, quiz_id, subject, date, players, questions, recap, owner_id) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(id)
    .bind(quiz_id)
    .bind(subject)
    .bind(date)
    .bind(players)
    .bind(questions)
    .bind(recap)
    .bind(owner_id)
    .execute(pool)
    .await
    .map(|_| id.to_string())
    .map_err(|e| e.to_string())
}

/// Delete a game result by id.
/// Returns true if a row was deleted, false if not found / not owned / error.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
pub async fn delete_result(pool: &Option<PgPool>, id: &str, me: Option<i64>) -> bool {
    let pool = match pool {
        Some(p) => p,
        None => return false,
    };

    match sqlx::query(
        "DELETE FROM game_results WHERE id = $1 AND ($2::bigint IS NULL OR owner_id = $2)",
    )
    .bind(id)
    .bind(me)
    .execute(pool)
    .await
    {
        Ok(result) => result.rows_affected() > 0,
        Err(_) => false,
    }
}

/// One id that could not be deleted (missing / not owned). Wire shape is an
/// object `{id, reason}` so the client does not receive a bare pair array.
#[derive(Debug, serde::Serialize)]
pub struct FailedResultEntry {
    pub id: String,
    pub reason: &'static str,
}

/// Outcome of a bulk result delete. Missing / not-owned ids are always
/// `not_found` so ownership status is never leaked.
#[derive(Debug, serde::Serialize)]
pub struct BulkDeleteOutcome {
    pub succeeded: Vec<String>,
    pub failed: Vec<FailedResultEntry>,
}

/// Bulk-delete game results in one transaction.
/// Dedupes `ids` (first-seen order). Owner scope matches `delete_result`.
/// `me`: None = admin/unguarded; Some(id) = only that owner's rows.
/// TX / SQL failures bubble as `Err`; only post-commit missing ids become
/// `failed` with reason `not_found`.
pub async fn delete_results(
    pool: &PgPool,
    ids: &[String],
    me: Option<i64>,
) -> Result<BulkDeleteOutcome, sqlx::Error> {
    let mut seen = std::collections::HashSet::with_capacity(ids.len());
    let unique: Vec<String> = ids
        .iter()
        .filter(|id| seen.insert((*id).as_str()))
        .cloned()
        .collect();

    if unique.is_empty() {
        return Ok(BulkDeleteOutcome {
            succeeded: Vec::new(),
            failed: Vec::new(),
        });
    }

    let mut tx = pool.begin().await?;

    // Same owner-scope predicate as delete_result; ANY for batch.
    let deleted: Vec<(String,)> = sqlx::query_as(
        "DELETE FROM game_results \
         WHERE id = ANY($1) AND ($2::bigint IS NULL OR owner_id = $2) \
         RETURNING id",
    )
    .bind(&unique)
    .bind(me)
    .fetch_all(&mut *tx)
    .await?;

    let succeeded: Vec<String> = deleted.into_iter().map(|(id,)| id).collect();

    tx.commit().await?;

    let succeeded_set: std::collections::HashSet<&str> =
        succeeded.iter().map(|s| s.as_str()).collect();
    let failed = unique
        .into_iter()
        .filter(|id| !succeeded_set.contains(id.as_str()))
        .map(|id| FailedResultEntry {
            id,
            reason: "not_found",
        })
        .collect();

    Ok(BulkDeleteOutcome { succeeded, failed })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timestamp_wire_format() {
        // Verify that timestamps are formatted correctly:
        // - Exactly 24 characters (ISO 8601 with millis + Z)
        // - Ends with Z
        // - Contains 3 digits for milliseconds before Z
        let now = chrono::Utc::now();
        let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        assert_eq!(formatted.len(), 24, "Timestamp should be exactly 24 chars: {}", formatted);
        assert!(formatted.ends_with('Z'), "Timestamp should end with Z: {}", formatted);

        // Verify format: YYYY-MM-DDTHH:MM:SS.sssZ
        // Position 19 should be '.', position 23 should be 'Z'
        let chars: Vec<char> = formatted.chars().collect();
        assert_eq!(chars[19], '.', "Char at position 19 should be '.': {}", formatted);
        assert_eq!(chars[23], 'Z', "Char at position 23 should be 'Z': {}", formatted);
    }

    #[tokio::test]
    async fn delete_without_pool_returns_false() {
        // Non-owner path is SQL-guarded; without a pool the call is a no-op fail-closed.
        assert!(!delete_result(&None, "any-id", Some(99)).await);
        assert!(!delete_result(&None, "any-id", None).await);
    }
}
