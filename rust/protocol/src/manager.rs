//! manager.rs — OWNS: ManagerConfig, MANAGER auth/config/game-admin/plugin/
//! submissions payloads (manager:auth, manager:config, manager:setGameConfig,
//! manager:listGames/gamesData/endGame, manager:plugin*, manager:*Submission*,
//! ...), GamesDataPayload, and Submission.
//!

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::player::GameUpdateQuestion;
use crate::player::Player;
use crate::status::Status;
use crate::status::ScoringMode;

// ─── Helper / Wrapper Types ──────────────────────────────────────────────────

/// Empty payload wrapper for gameId-only events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MessageGameId {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub host_token: Option<String>,
}

// ─── Enums ──────────────────────────────────────────────────────────────────

/// Submission status variants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum SubmissionStatus {
    Pending,
    Approved,
    Rejected,
}

/// Submission category (public topic category).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum SubmissionCategory {
    Science,
    History,
    Geography,
    General,
    Sports,
    Entertainment,
    Technology,
    Other,
}

/// SetSkeletonAsset / SetSkeletonAssetSuccess kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum SkeletonAssetKind {
    #[serde(rename = "css")]
    Css,
    #[serde(rename = "js")]
    Js,
}


// ─── Client → Server (C2S) Payloads ─────────────────────────────────────────

pub type ManagerAuth = String;
pub type ManagerReconnect = MessageGameId;
pub type ManagerLeave = MessageGameId;
pub type ManagerStartGame = MessageGameId;
pub type ManagerAbortQuiz = MessageGameId;
pub type ManagerNextQuestion = MessageGameId;
pub type ManagerShowLeaderboard = MessageGameId;
pub type ManagerSkipQuestion = MessageGameId;
pub type ManagerRevealAnswer = MessageGameId;
pub type ManagerSetTheme = Value;
pub type ManagerSubmitQuestion = Value;
pub type ManagerEditSubmission = Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerKickPlayer {
    pub game_id: String,
    pub player_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSetAuto {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
    pub auto: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerAddBots {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
    pub count: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerAdjustTimer {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
    pub delta_seconds: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerPauseGame {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerResumeGame {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSetGameConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub team_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub low_latency_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub join_locked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub randomize_answers: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scoring_mode: Option<ScoringMode>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSetAchievementsConfig {
    pub config: std::collections::HashMap<String, AchievementConfigEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AchievementConfigEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub threshold: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bonus: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tier: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSetSkeletonAsset {
    pub kind: SkeletonAssetKind,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerUploadBackground {
    pub slot: String,
    pub data_url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerUploadSound {
    pub slot: String,
    pub data_url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerPluginInstall {
    pub zip_base64: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerPluginRemove {
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerPluginSetConfig {
    pub id: String,
    pub config: std::collections::HashMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerApproveSubmission {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub quizz_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub to_catalog: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerRejectSubmission {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub category: Option<SubmissionCategory>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerGenerateImage {
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerEditImage {
    pub base_url: String,
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSubmitUploadImage {
    pub filename: String,
    pub data_url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerEnhancePrompt {
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct EndGamePayload {
    pub game_id: String,
}

// ─── Server → Client (S2C) Payloads ─────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSuccessReconnect {
    pub game_id: String,
    pub status: StatusUpdate,
    pub players: Vec<Player>,
    pub current_question: GameUpdateQuestion,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusUpdate {
    pub name: Status,
    pub data: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerConfig {
    pub quizz: Value,
    pub results: Value,
    pub submissions: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_templates: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub low_latency_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub join_locked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub randomize_answers: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scoring_mode: Option<ScoringMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub achievements: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugins: Option<Vec<InstalledPlugin>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observability: Option<Observability>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Observability {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub grafana_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub loki_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub prometheus_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<std::collections::HashMap<String, Value>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerGameCreated {
    pub game_id: String,
    pub invite_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub host_token: Option<String>,
}

pub type ManagerStatusUpdate = StatusUpdate;
pub type ManagerNewPlayer = Player;
pub type ManagerRemovePlayer = String;
pub type ManagerErrorMessage = String;
pub type ManagerPlayerKicked = String;
pub type ManagerTheme = Value;
pub type ManagerSetThemeSuccess = Value;
pub type ManagerThemeError = String;
pub type ManagerSubmissionsData = Vec<Submission>;
pub type ManagerSubmissionError = String;
pub type ManagerImageError = String;
pub type ManagerPluginConfig = Vec<InstalledPlugin>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerPlayerReconnected {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSetSkeletonAssetSuccess {
    pub kind: SkeletonAssetKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerBackgroundUploaded {
    pub slot: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSoundUploaded {
    pub slot: String,
    pub asset_ref: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerImageGenerated {
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerUploadImageSuccess {
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ManagerPromptEnhanced {
    pub prompt: String,
}

pub type GamesDataPayload = Vec<GameSummary>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GameSummary {
    pub game_id: String,
    pub invite_code: String,
    pub subject: String,
    pub player_count: i32,
    pub started: bool,
    pub manager_connected: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Submission {
    pub id: String,
    pub submitted_by: String,
    pub submitted_at: String,
    pub status: SubmissionStatus,
    pub question: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<SubmissionCategory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rejection_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionMeta {
    pub id: String,
    pub submitted_by: String,
    pub submitted_at: String,
    pub status: SubmissionStatus,
    pub question: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manager_kick_player_roundtrip() {
        let json = r#"{"gameId":"game123","playerId":"player456"}"#;
        let payload: ManagerKickPlayer = serde_json::from_str(json).unwrap();
        assert_eq!(payload.game_id, "game123");
        assert_eq!(payload.player_id, "player456");
        let serialized = serde_json::to_string(&payload).unwrap();
        let deserialized: ManagerKickPlayer = serde_json::from_str(&serialized).unwrap();
        assert_eq!(payload, deserialized);
    }

    #[test]
    fn test_manager_set_game_config_roundtrip() {
        let json = r#"{"teamMode":true,"lowLatencyEnabled":false,"scoringMode":"accuracy"}"#;
        let payload: ManagerSetGameConfig = serde_json::from_str(json).unwrap();
        assert_eq!(payload.team_mode, Some(true));
        assert_eq!(payload.low_latency_enabled, Some(false));
        assert_eq!(payload.scoring_mode, Some(ScoringMode::Accuracy));
        let serialized = serde_json::to_string(&payload).unwrap();
        let deserialized: ManagerSetGameConfig = serde_json::from_str(&serialized).unwrap();
        assert_eq!(payload, deserialized);
    }

    #[test]
    fn test_manager_game_created_roundtrip() {
        let json = r#"{"gameId":"abc123","inviteCode":"CODE42"}"#;
        let payload: ManagerGameCreated = serde_json::from_str(json).unwrap();
        assert_eq!(payload.game_id, "abc123");
        assert_eq!(payload.invite_code, "CODE42");
        let serialized = serde_json::to_string(&payload).unwrap();
        let deserialized: ManagerGameCreated = serde_json::from_str(&serialized).unwrap();
        assert_eq!(payload, deserialized);
    }

    #[test]
    fn test_submission_status_roundtrip() {
        let json = r#""pending""#;
        let status: SubmissionStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status, SubmissionStatus::Pending);
        let serialized = serde_json::to_string(&status).unwrap();
        assert_eq!(serialized, r#""pending""#);
    }

    #[test]
    fn test_submission_category_roundtrip() {
        let json = r#""technology""#;
        let category: SubmissionCategory = serde_json::from_str(json).unwrap();
        assert_eq!(category, SubmissionCategory::Technology);
        let serialized = serde_json::to_string(&category).unwrap();
        assert_eq!(serialized, r#""technology""#);
    }

    #[test]
    fn test_game_summary_roundtrip() {
        let json = r#"{"gameId":"g1","inviteCode":"CODE","subject":"Math","playerCount":5,"started":true,"managerConnected":true,"createdAt":1234567890}"#;
        let summary: GameSummary = serde_json::from_str(json).unwrap();
        assert_eq!(summary.game_id, "g1");
        assert_eq!(summary.player_count, 5);
        let serialized = serde_json::to_string(&summary).unwrap();
        let deserialized: GameSummary = serde_json::from_str(&serialized).unwrap();
        assert_eq!(summary, deserialized);
    }
}
