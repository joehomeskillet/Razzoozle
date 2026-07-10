use sqlx::PgPool;

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
pub async fn get_result_by_id(pool: &Option<PgPool>, id: &str) -> Option<serde_json::Value> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(String, String, chrono::DateTime<chrono::Utc>, serde_json::Value, Option<serde_json::Value>, Option<serde_json::Value>)> =
        sqlx::query_as("SELECT id, subject, date, players, questions, recap FROM game_results WHERE id = $1")
            .bind(id)
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
) -> Result<String, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Err("errors:result.failedToSave".to_string()),
    };

    sqlx::query(
        "INSERT INTO game_results (id, quiz_id, subject, date, players, questions, recap) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(id)
    .bind(quiz_id)
    .bind(subject)
    .bind(date)
    .bind(players)
    .bind(questions)
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
}
