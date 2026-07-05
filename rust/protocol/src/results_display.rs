//! results_display.rs — OWNS: RESULTS domain (results:*, GameResult,
//! SharedResult) + DISPLAY domain (display:*) payloads + system events
//! (connect/disconnect).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ────────────────────────────────────────────────────────────────────────────
// RESULTS Domain Types
// ────────────────────────────────────────────────────────────────────────────

/// Player rank entry in game results.
/// Emitted via RESULTS.DATA and RESULTS.SHARED_DATA.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GameResultPlayer {
    pub username: String,
    pub points: i32,
    pub rank: i32,
}

/// Superlative award key.
/// One of the post-game superlatives (fastest finger, most correct, etc.).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SuperlativeKey {
    FastestFinger,
    MostCorrect,
    MostWrong,
    LongestStreak,
    BiggestClimber,
    LuckyGuesser,
    ComebackKid,
    MostAchievements,
    HardestQuestion,
}

/// One awarded superlative from post-game recap.
/// Carries the winner's name, avatar (optional), and the numeric stat that won it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Superlative {
    pub key: SuperlativeKey,
    pub winner_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub winner_avatar: Option<String>,
    pub value: f64,
}

/// Post-game recap with superlatives and hardest question detail.
/// Optional field on GameResult and SharedResult (RESULTS.DATA, RESULTS.SHARED_DATA).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ManagerRecap {
    pub superlatives: Vec<Superlative>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hardest_question: Option<HardestQuestion>,
}

/// Details of the hardest question (lowest correct %) in a quiz.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HardestQuestion {
    pub question_index: i32,
    pub correct_pct: f64,
}

/// Per-answer record for a single player on a single question.
/// Part of QuestionResult; tracked during gameplay.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlayerAnswerRecord {
    pub player_name: String,
    /// Single-choice answer index, or null for no answer / type-answer.
    pub answer_id: Option<i32>,
    /// Multiple-select indices (absent for single-choice).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answer_ids: Option<Vec<i32>>,
    /// Free-text answer (absent for single/multiple-choice).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answer_text: Option<String>,
    /// Milliseconds from question start to answer, or null for legacy results.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub response_ms: Option<i32>,
}

/// A question with all player answers for that question.
/// QuestionResult = Question & { playerAnswers: ... }
/// FIXME cross-module: depends on crate::quizz::Question (not yet defined).
/// This struct serializes with flattened Question fields + playerAnswers.
/// Does NOT export to TS until Question is ported; for now uses serde for
/// round-trip tests only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionResult {
    /// The complete question object (all fields from quizz::Question).
    /// Serialized flat, alongside player_answers.
    #[serde(flatten)]
    pub question: serde_json::Value,
    pub player_answers: Vec<PlayerAnswerRecord>,
}

/// Game result payload (RESULTS.DATA).
/// Complete game history with all questions, answers, and post-game recap.
/// NOTE: Does NOT export to TS yet due to QuestionResult cross-module dependency
/// on quizz::Question. Will be updated when quizz module is ported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GameResult {
    pub id: String,
    pub subject: String,
    pub date: String,
    pub players: Vec<GameResultPlayer>,
    pub questions: Vec<QuestionResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recap: Option<ManagerRecap>,
}

/// Shared (public) game result payload (RESULTS.SHARED_DATA).
/// Deliberately omits `questions` (per-question answers/solutions) for privacy.
/// Only the final ranking and post-game recap (superlatives) are shared.
/// NOTE: Does NOT export to TS yet for consistency with GameResult (both depend
/// on cross-module Question type). Will be updated when quizz module is ported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SharedResult {
    pub id: String,
    pub subject: String,
    pub date: String,
    pub players: Vec<GameResultPlayer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recap: Option<ManagerRecap>,
}

// ────────────────────────────────────────────────────────────────────────────
// DISPLAY Domain Types (Satellite/Kiosk Pairing & Heartbeat)
// ────────────────────────────────────────────────────────────────────────────

/// Payload for DISPLAY.REGISTER (C2S): display registers with server.
/// Optional: the client may send `{name: "..."}`or `null`/undefined.
/// Serde defaults missing fields to None.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayRegisterPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
}

/// Payload for DISPLAY.PAIR (C2S): manager pairs a display to a game.
/// The display (registered via code) is joined to the game room.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayPairPayload {
    pub code: String,
    /// Legacy fallback (socket auth is primary).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub manager_password: Option<String>,
    pub game_id: String,
}

/// Payload for DISPLAY.DISCONNECT (C2S): display unpairs from pairing code.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayDisconnectPayload {
    pub code: String,
}

/// Payload for DISPLAY.PING (C2S): display heartbeat to keep status live.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayPingPayload {
    pub game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
}

/// Payload for DISPLAY.REGISTERED (S2C): server confirms registration.
/// Carries the generated pairing code.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayRegisteredPayload {
    pub code: String,
}

/// Payload for DISPLAY.PAIR_SUCCESS (S2C): pairing confirmed.
/// Both display and manager sockets receive this confirmation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayPairSuccessPayload {
    pub game_id: String,
}

/// One display entry in the live status list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayStatus {
    pub socket_id: String,
    pub name: String,
    pub last_ping_at: i64,
}

/// Payload for DISPLAY.STATUS (S2C): complete display status for a game.
/// Array of connected displays with their IDs, names, and last-ping timestamps.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisplayStatusPayload {
    pub displays: Vec<DisplayStatus>,
}

// ────────────────────────────────────────────────────────────────────────────
// System Events (Socket.io built-in)
// ────────────────────────────────────────────────────────────────────────────

/// Marker for the built-in "connect" event (no payload).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConnectPayload {}

/// Marker for the built-in "disconnect" event (no payload).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DisconnectPayload {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_result_round_trip() {
        let json = r#"{
            "id": "game-123",
            "subject": "History",
            "date": "2026-07-05",
            "players": [
                {"username": "Alice", "points": 100, "rank": 1},
                {"username": "Bob", "points": 80, "rank": 2}
            ],
            "questions": [
                {
                    "id": "q1",
                    "text": "What year?",
                    "answers": ["1984", "1985"],
                    "playerAnswers": [
                        {"playerName": "Alice", "answerId": 0, "responseMs": 1500}
                    ]
                }
            ],
            "recap": {
                "superlatives": [
                    {
                        "key": "fastest_finger",
                        "winnerName": "Alice",
                        "value": 1500
                    }
                ]
            }
        }"#;

        let result: GameResult = serde_json::from_str(json).expect("parse GameResult");
        assert_eq!(result.id, "game-123");
        assert_eq!(result.subject, "History");
        assert_eq!(result.players.len(), 2);
        assert_eq!(result.questions.len(), 1);
        assert!(result.recap.is_some());

        let recap = result.recap.as_ref().unwrap();
        assert_eq!(recap.superlatives.len(), 1);
        assert_eq!(recap.superlatives[0].winner_name, "Alice");
        assert_eq!(recap.superlatives[0].value, 1500.0);

        let re_encoded = serde_json::to_value(&result).expect("encode GameResult");
        let re_parsed: GameResult =
            serde_json::from_value(re_encoded).expect("re-parse GameResult");
        assert_eq!(re_parsed.id, result.id);
        assert_eq!(re_parsed.players.len(), result.players.len());
    }

    #[test]
    fn test_shared_result_round_trip() {
        let json = r#"{
            "id": "game-456",
            "subject": "Geography",
            "date": "2026-07-05",
            "players": [
                {"username": "Charlie", "points": 120, "rank": 1},
                {"username": "Diana", "points": 100, "rank": 2}
            ]
        }"#;

        let result: SharedResult = serde_json::from_str(json).expect("parse SharedResult");
        assert_eq!(result.id, "game-456");
        assert_eq!(result.subject, "Geography");
        assert_eq!(result.players.len(), 2);
        assert!(result.recap.is_none());

        let encoded = serde_json::to_string(&result).expect("encode SharedResult");
        let reparsed: SharedResult = serde_json::from_str(&encoded).expect("re-parse SharedResult");
        assert_eq!(reparsed.id, result.id);
    }

    #[test]
    fn test_display_pair_payload_round_trip() {
        let json = r#"{
            "code": "ABC123",
            "managerPassword": "secret",
            "gameId": "game-789"
        }"#;

        let payload: DisplayPairPayload = serde_json::from_str(json).expect("parse DisplayPairPayload");
        assert_eq!(payload.code, "ABC123");
        assert_eq!(payload.manager_password, Some("secret".to_string()));
        assert_eq!(payload.game_id, "game-789");

        let encoded = serde_json::to_string(&payload).expect("encode DisplayPairPayload");
        let reparsed: DisplayPairPayload = serde_json::from_str(&encoded).expect("re-parse DisplayPairPayload");
        assert_eq!(reparsed.code, payload.code);
    }

    #[test]
    fn test_display_status_payload_round_trip() {
        let json = r#"{
            "displays": [
                {"socketId": "socket-1", "name": "Beamer", "lastPingAt": 1700000000},
                {"socketId": "socket-2", "name": "Kiosk", "lastPingAt": 1700000100}
            ]
        }"#;

        let payload: DisplayStatusPayload = serde_json::from_str(json).expect("parse DisplayStatusPayload");
        assert_eq!(payload.displays.len(), 2);
        assert_eq!(payload.displays[0].socket_id, "socket-1");
        assert_eq!(payload.displays[0].name, "Beamer");
        assert_eq!(payload.displays[1].socket_id, "socket-2");
        assert_eq!(payload.displays[1].name, "Kiosk");

        let encoded = serde_json::to_string(&payload).expect("encode DisplayStatusPayload");
        let reparsed: DisplayStatusPayload = serde_json::from_str(&encoded).expect("re-parse DisplayStatusPayload");
        assert_eq!(reparsed.displays.len(), payload.displays.len());
    }

    #[test]
    fn test_superlative_enum_serde() {
        let json = r#"{"key": "fastest_finger", "winnerName": "Alice", "value": 1500}"#;
        let superlative: Superlative = serde_json::from_str(json).expect("parse Superlative");
        assert_eq!(superlative.winner_name, "Alice");
        assert_eq!(superlative.value, 1500.0);

        let encoded = serde_json::to_string(&superlative).expect("encode Superlative");
        let reparsed: Superlative = serde_json::from_str(&encoded).expect("re-parse Superlative");
        assert_eq!(reparsed.winner_name, superlative.winner_name);
    }
}
