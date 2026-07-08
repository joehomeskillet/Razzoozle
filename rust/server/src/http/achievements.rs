use axum::Json;
use serde::{Deserialize, Serialize};
use std::fs;

use super::get_config_path;

#[derive(Debug, Serialize, Deserialize)]
pub struct MergedAchievement {
    pub id: String,
    pub tier: String,  // "bronze" | "silver" | "gold" | "diamant"
    pub enabled: bool,
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threshold: Option<i32>,
    pub bonus: i32,
}

#[derive(Debug, Serialize)]
pub struct AchievementsResponse {
    pub achievements: Vec<MergedAchievement>,
}

/// Get merged achievements (from config/achievements.json)
/// In Runde 4, can be switched to DB query without changing HTTP handler signature
pub async fn get_merged_achievements() -> Vec<MergedAchievement> {
    let config_path = format!("{}/achievements.json", get_config_path());

    match fs::read_to_string(&config_path) {
        Ok(contents) => {
            match serde_json::from_str::<Vec<MergedAchievement>>(&contents) {
                Ok(achievements) => achievements,
                Err(_) => get_default_achievements(),
            }
        }
        Err(_) => get_default_achievements(),
    }
}

/// Default achievements registry (hardcoded fallback)
fn get_default_achievements() -> Vec<MergedAchievement> {
    vec![
        MergedAchievement {
            id: "sharpshooter".to_string(),
            tier: "silver".to_string(),
            enabled: true,
            name: "Sharpshooter".to_string(),
            description: "Answer a slider question with 95% accuracy".to_string(),
            threshold: Some(95),
            bonus: 250,
        },
    ]
}

pub async fn handle_achievements() -> Json<AchievementsResponse> {
    let achievements = get_merged_achievements().await;
    Json(AchievementsResponse { achievements })
}
