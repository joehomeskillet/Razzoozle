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

