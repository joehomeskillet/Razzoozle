//! player.rs — OWNS: the Player type, PLAYER S2C payloads
//! (player:successReconnect, player:updateLeaderboard, player:answerAck),
//! plus CLOCK (clock:ping/pong) and METRICS (metrics:report/subscribe/health)
//! payloads.
//!
// filled by WP-player

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ============================================================================
// Core Player Type
// ============================================================================

/// Player type: core game participant data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    pub client_id: String,
    pub connected: bool,
    pub username: String,
    pub points: i32,
    pub streak: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_bot: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub achievements: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identifier_hash: Option<String>,
}

/// Question progress marker.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GameUpdateQuestion {
    pub current: i32,
    pub total: i32,
}

// ============================================================================
// PLAYER S2C Payloads
// ============================================================================

/// Reason for answer acceptance/rejection (low-latency mode).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum AnswerAckReason {
    Ok,
    Duplicate,
    TooLate,
    InvalidQuestion,
    InvalidAnswer,
}

/// Answer ack payload (low-latency mode).
/// Emitted on `player:answerAck`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AnswerAck {
    pub accepted: bool,
    pub reason: AnswerAckReason,
    pub server_received_at_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_message_id: Option<String>,
}

/// Status payload (placeholder for cross-module type).
// FIXME cross-module: status.rs not yet written
pub type StatusValue = serde_json::Value;

/// Player reconnect payload.
/// Emitted on `player:successReconnect`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSuccessReconnect {
    pub game_id: String,
    #[ts(type = "any")]
    pub status: StatusValue,
    pub player: PlayerReconnectInfo,
    pub current_question: GameUpdateQuestion,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub already_answered: Option<bool>,
}

/// Minimal player info in reconnect.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerReconnectInfo {
    pub username: String,
    pub points: i32,
}

/// Leaderboard update payload.
/// Emitted on `player:updateLeaderboard`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PlayerUpdateLeaderboard {
    pub leaderboard: Vec<Player>,
}

// ============================================================================
// CLOCK S2C Payloads (Low-Latency Mode)
// ============================================================================

/// Clock sync ping (client monotonic timestamp).
/// Sent on `clock:ping`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ClockPing {
    pub client_send_mono_ms: i64,
}

/// Clock sync pong response.
/// Emitted on `clock:pong`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ClockPong {
    pub client_send_mono_ms: i64,
    pub server_now_ms: i64,
}

// ============================================================================
// METRICS C2S/S2C Payloads (Low-Latency Mode)
// ============================================================================

/// Metric kind enum.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum MetricKind {
    #[serde(rename = "rtt")]
    Rtt,
    #[serde(rename = "clockOffset")]
    ClockOffset,
    #[serde(rename = "answerAck")]
    AnswerAck,
}

/// Metrics sample report (client->server).
/// Sent on `metrics:report`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MetricsReport {
    pub kind: MetricKind,
    pub value: i32,
}

/// Metrics subscription (client->server).
/// Sent on `metrics:subscribe`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MetricsSubscribe {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
}

/// Metric percentiles (one bucket of rolling samples).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MetricPercentiles {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p50: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p95: Option<i32>,
    pub count: i32,
}

/// Metrics health snapshot (server->host).
/// Emitted on `metrics:health`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MetricsHealthSnapshot {
    pub rtt: MetricPercentiles,
    pub clock_offset: MetricPercentiles,
    pub answer_ack: MetricPercentiles,
    pub reconnect_count: i32,
    pub rejected: std::collections::HashMap<String, i32>,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_player_roundtrip() {
        let player = Player {
            id: "p1".to_string(),
            client_id: "c1".to_string(),
            connected: true,
            username: "Alice".to_string(),
            points: 100,
            streak: 3,
            is_bot: None,
            avatar: Some("data:image/svg+xml,...".to_string()),
            achievements: Some(vec!["first_correct".to_string()]),
            team_id: None,
            identifier_hash: None,
        };

        let json_str = serde_json::to_string(&player).unwrap();
        let restored: Player = serde_json::from_str(&json_str).unwrap();
        assert_eq!(player, restored);
    }

    #[test]
    fn test_answer_ack_roundtrip() {
        let ack = AnswerAck {
            accepted: true,
            reason: AnswerAckReason::Ok,
            server_received_at_ms: 1234567890,
            client_message_id: Some("tap-123".to_string()),
        };

        let json_str = serde_json::to_string(&ack).unwrap();
        let restored: AnswerAck = serde_json::from_str(&json_str).unwrap();
        assert_eq!(ack, restored);
    }

    #[test]
    fn test_player_success_reconnect_roundtrip() {
        let payload = PlayerSuccessReconnect {
            game_id: "g1".to_string(),
            status: json!({"name": "SHOW_QUESTION", "data": {}}),
            player: PlayerReconnectInfo {
                username: "Bob".to_string(),
                points: 50,
            },
            current_question: GameUpdateQuestion {
                current: 2,
                total: 5,
            },
            already_answered: Some(true),
        };

        let json_str = serde_json::to_string(&payload).unwrap();
        let restored: PlayerSuccessReconnect = serde_json::from_str(&json_str).unwrap();
        assert_eq!(payload, restored);
    }

    #[test]
    fn test_metrics_health_snapshot_roundtrip() {
        let snapshot = MetricsHealthSnapshot {
            rtt: MetricPercentiles {
                p50: Some(50),
                p95: Some(100),
                count: 10,
            },
            clock_offset: MetricPercentiles {
                p50: Some(5),
                p95: Some(15),
                count: 10,
            },
            answer_ack: MetricPercentiles {
                p50: None,
                p95: None,
                count: 0,
            },
            reconnect_count: 1,
            rejected: [("duplicate".to_string(), 2)]
                .iter()
                .cloned()
                .collect(),
        };

        let json_str = serde_json::to_string(&snapshot).unwrap();
        let restored: MetricsHealthSnapshot = serde_json::from_str(&json_str).unwrap();
        assert_eq!(snapshot, restored);
    }
}
