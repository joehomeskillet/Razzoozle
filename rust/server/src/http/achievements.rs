use axum::Json;
use serde_json::json;
use std::fs;

use super::get_config_path;

#[derive(Debug, serde::Serialize)]
pub struct AchievementsResponse {
    pub achievements: serde_json::Value,
}

/// GET /api/achievements — read achievements.json and return merged achievements.
/// Public route (no auth required).
pub async fn handle_get_achievements() -> Json<AchievementsResponse> {
    let config_path = get_config_path();
    let achievements_path = format!("{}/achievements.json", config_path);

    // Read achievements.json; fallback to empty array if not found
    let achievements = tokio::task::spawn_blocking({
        let path = achievements_path.clone();
        move || {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_else(|| json!([]))
        }
    })
    .await
    .unwrap_or_else(|_| json!([]));

    Json(AchievementsResponse { achievements })
}
