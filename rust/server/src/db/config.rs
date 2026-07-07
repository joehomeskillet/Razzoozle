use sqlx::PgPool;

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

