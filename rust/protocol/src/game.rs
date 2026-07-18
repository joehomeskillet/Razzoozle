//! game.rs — OWNS: GAME domain C2S+S2C payloads.
//!
//! C2S: game:create, player:join, player:login, player:reconnect,
//!      player:leave, player:selectedAnswer, player:setAvatar,
//!      player:selectTeam, clock:ping.
//! S2C: game:successRoom, game:successJoin, game:totalPlayers,
//!      game:errorMessage, game:startCooldown, game:cooldown,
//!      game:updateQuestion, game:playerAnswer, game:reset.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ============================================================================
// Generic Message Wrappers
// ============================================================================

/// Generic wrapper for gameId + data payload
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MessageWithoutStatus<T> {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
    pub data: T,
}

/// GameId-only message wrapper
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MessageGameId {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub game_id: Option<String>,
}

// ============================================================================
// C2S Payloads (Client → Server)
// ============================================================================

/// game:create payload (C2S) — supports both legacy bare quizzId (string) and new
/// CreateGamePayload with mode selection. Uses serde(untagged) for back-compat.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(untagged)]
pub enum GameCreate {
    /// Legacy: old client sends bare quizzId string
    Legacy(String),
    /// New: client sends {quizzId, selectedModes}
    CreatePayload(CreateGamePayload),
}

/// Game creation payload with optional mode selection
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct CreateGamePayload {
    pub quizz_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub selected_modes: Option<SelectedModes>,
    /// Class bound to this game when klassen mode is on (A10 / Wave-1 §B).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub class_id: Option<i64>,
}

/// Per-game mode selection snapshot (host's choices at game creation)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SelectedModes {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scoring_mode: Option<String>, // "speed" | "accuracy"
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub team_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub klassen: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub end_screen: Option<EndScreen>,
}

/// End-screen display mode (mutually exclusive)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum EndScreen {
    Full,
    Top3,
    Private,
}

/// player:join payload (C2S) — invite code
pub type PlayerJoin = String;

/// player:login payload (C2S)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerLogin {
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub identifier: Option<String>,
    /// Class-mode identity (Wave-1 §B). Optional; non-klassen logins omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub student_id: Option<i64>,
    /// Class-mode emoji PIN as 4 symbols copied from `EMOJI_PIN_SET` (A2).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub emoji_pin: Option<Vec<String>>,
}

/// Roster row returned in `game:successRoom` for klassen games (A5).
/// Never carries PINs or extra PII.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct RosterEntry {
    pub student_id: i64,
    pub display_name: String,
    pub already_joined: bool,
}

/// player:reconnect payload (C2S)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerReconnect {
    pub game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_server_seq: Option<i32>,
}

/// player:leave payload (C2S)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerLeave {
    pub game_id: String,
}

/// player:selectedAnswer payload (C2S)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSelectedAnswer {
    pub answer_key: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answer_keys: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answer_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub client_message_id: Option<String>,
}

/// player:setAvatar payload (C2S) — unknown type from TS
pub type PlayerSetAvatar = serde_json::Value;

/// player:selectTeam payload (C2S)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSelectTeam {
    pub team_id: String,
}

/// clock:ping payload (C2S) — client monotonic timestamp
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ClockPing {
    pub client_send_mono_ms: i64,
}

// ============================================================================
// S2C Payloads (Server → Client)
// ============================================================================

/// game:successRoom payload (S2C)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GameSuccessRoom {
    pub game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub require_identifier: Option<bool>,
    /// True when this game is class-mode (class_id is set). Omitted for free-join.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub klassen: Option<bool>,
    /// Class roster (post game-PIN join only — A8). Never includes PINs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub roster: Option<Vec<RosterEntry>>,
}

/// game:successJoin payload (S2C) — mirrors node's player-manager.ts join():
/// `socket.emit(EVENTS.GAME.SUCCESS_JOIN, { gameId, playerToken })`. Was
/// previously a bare-string alias; the client (Username.tsx) reads
/// `payload.gameId` / `payload.playerToken` off an OBJECT, so a bare string
/// left both undefined — the player landed on `/party/undefined`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GameSuccessJoin {
    pub game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub player_token: Option<String>,
}

/// game:totalPlayers payload (S2C) — count number
pub type GameTotalPlayers = i32;

/// game:errorMessage payload (S2C) — message string
pub type GameErrorMessage = String;

/// game:startCooldown payload (S2C) — no data
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GameStartCooldown {}

/// game:cooldown payload (S2C) — count number
pub type GameCooldown = i32;

/// game:reset payload (S2C) — message string
pub type GameReset = String;

/// game:updateQuestion payload (S2C)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GameUpdateQuestion {
    pub current: i32,
    pub total: i32,
}

/// game:playerAnswer payload (S2C) — count number
pub type GamePlayerAnswer = i32;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_message_without_status_roundtrip() {
        let msg = MessageWithoutStatus {
            game_id: Some("game-123".to_string()),
            data: json!({"test": "data"}),
        };
        let json = serde_json::to_value(&msg).unwrap();
        let re_parsed: MessageWithoutStatus<serde_json::Value> =
            serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.game_id, Some("game-123".to_string()));
    }

    #[test]
    fn test_player_login_roundtrip() {
        let login = PlayerLogin {
            username: "Alice".to_string(),
            avatar: Some("avatar-url".to_string()),
            identifier: None,
            student_id: Some(42),
            emoji_pin: Some(vec!["🐱".into(), "🐶".into(), "🐭".into(), "🐹".into()]),
        };
        let json = serde_json::to_value(&login).unwrap();
        assert_eq!(json["studentId"], 42);
        assert_eq!(json["emojiPin"].as_array().unwrap().len(), 4);
        let re_parsed: PlayerLogin = serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.username, "Alice");
        assert_eq!(re_parsed.avatar, Some("avatar-url".to_string()));
        assert_eq!(re_parsed.student_id, Some(42));
        assert_eq!(re_parsed.emoji_pin.as_ref().unwrap().len(), 4);
    }

    #[test]
    fn test_player_login_legacy_without_klassen_fields() {
        // Back-compat: old clients omit studentId/emojiPin → default None.
        let json = json!({"username": "Bob", "avatar": null});
        let re_parsed: PlayerLogin = serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.username, "Bob");
        assert!(re_parsed.student_id.is_none());
        assert!(re_parsed.emoji_pin.is_none());
    }

    #[test]
    fn test_game_success_room_roundtrip() {
        let room = GameSuccessRoom {
            game_id: "room-456".to_string(),
            require_identifier: Some(true),
            klassen: Some(true),
            roster: Some(vec![RosterEntry {
                student_id: 1,
                display_name: "Anna".to_string(),
                already_joined: false,
            }]),
        };
        let json = serde_json::to_value(&room).unwrap();
        let re_parsed: GameSuccessRoom = serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.game_id, "room-456");
        assert_eq!(re_parsed.require_identifier, Some(true));
        assert_eq!(re_parsed.klassen, Some(true));
        assert_eq!(re_parsed.roster.as_ref().unwrap()[0].student_id, 1);
    }

    #[test]
    fn test_game_success_join_roundtrip() {
        let join = GameSuccessJoin {
            game_id: "game-789".to_string(),
            player_token: Some("tok-abc".to_string()),
        };
        let json = serde_json::to_value(&join).unwrap();
        assert_eq!(json["gameId"], "game-789");
        assert_eq!(json["playerToken"], "tok-abc");
        let re_parsed: GameSuccessJoin = serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.game_id, "game-789");
        assert_eq!(re_parsed.player_token, Some("tok-abc".to_string()));
    }

    #[test]
    fn test_game_update_question_roundtrip() {
        let update = GameUpdateQuestion {
            current: 5,
            total: 10,
        };
        let json = serde_json::to_value(&update).unwrap();
        let re_parsed: GameUpdateQuestion = serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.current, 5);
        assert_eq!(re_parsed.total, 10);
    }

    #[test]
    fn test_player_selected_answer_roundtrip() {
        let answer = PlayerSelectedAnswer {
            answer_key: 2,
            answer_keys: Some(vec![0, 2]),
            answer_text: Some("Custom answer".to_string()),
            client_message_id: None,
        };
        let json = serde_json::to_value(&answer).unwrap();
        let re_parsed: PlayerSelectedAnswer = serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.answer_key, 2);
        assert_eq!(re_parsed.answer_keys, Some(vec![0, 2]));
    }

    #[test]
    fn test_clock_ping_roundtrip() {
        let ping = ClockPing {
            client_send_mono_ms: 1234567890123i64,
        };
        let json = serde_json::to_value(&ping).unwrap();
        let re_parsed: ClockPing = serde_json::from_value(json).unwrap();
        assert_eq!(re_parsed.client_send_mono_ms, 1234567890123i64);
    }

    #[test]
    fn test_game_create_legacy_roundtrip() {
        let legacy = "quizz-123";
        let json = serde_json::to_value(legacy).unwrap();
        let parsed: GameCreate = serde_json::from_value(json).unwrap();
        assert_eq!(parsed, GameCreate::Legacy("quizz-123".to_string()));
    }

    #[test]
    fn test_game_create_payload_roundtrip() {
        let payload = CreateGamePayload {
            quizz_id: "quiz-456".to_string(),
            selected_modes: Some(SelectedModes {
                scoring_mode: Some("speed".to_string()),
                team_mode: Some(true),
                klassen: Some(false),
                end_screen: Some(EndScreen::Top3),
            }),
            class_id: Some(7),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["classId"], 7);
        let parsed: GameCreate = serde_json::from_value(json).unwrap();
        assert!(matches!(parsed, GameCreate::CreatePayload(_)));
    }

    #[test]
    fn test_selected_modes_optional() {
        let modes = SelectedModes {
            scoring_mode: None,
            team_mode: Some(false),
            klassen: None,
            end_screen: None,
        };
        let json = serde_json::to_value(&modes).unwrap();
        let parsed: SelectedModes = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.team_mode, Some(false));
        assert!(parsed.scoring_mode.is_none());
    }
}
