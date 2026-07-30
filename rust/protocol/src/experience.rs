//! experience.rs — OWNS: game:experience S2C envelope + mode-specific payloads.
//!
//! WP #876 — Protokoll-Contract Experience-Modi (Wave-0-Freeze)
//! Date: 2026-07-30
//!
//! Wire family: `game:experience` with envelope
//!   { mode, phase, phaseStartedAtServerMs, phaseDurationMs, revision, payload }
//!
//! Anti-cheat / scope: NO question text, answer options, media URLs, or solution
//! content may appear in this envelope (those stay on game:status). See status.rs
//! ShowQuestionData / SelectAnswerData for what deliberately stays OUT of here.
//!
//! FlowerBattle payload body is deferred to WP #927 — only the enum arm exists.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::game::ExperienceMode;

// ============================================================================
// Phase + envelope
// ============================================================================

/// Experience-mode phase within a live game (exactly 8 values).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ExperiencePhase {
    Intro,
    Question,
    AnswersLocked,
    Resolution,
    WorldTransition,
    LevelComplete,
    GameComplete,
    GameFailed,
}

/// S2C envelope for `game:experience` transitions.
///
/// Five structural fields + mode-tagged `payload`. No free-text / media / solution
/// fields — anti-cheat and separation from `game:status`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ExperienceTransition {
    pub mode: ExperienceMode,
    pub phase: ExperiencePhase,
    pub phase_started_at_server_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub phase_duration_ms: Option<i64>,
    pub revision: i32,
    pub payload: ExperiencePayload,
}

// ============================================================================
// Shared payload fragments
// ============================================================================

/// Per-team step progress (PyramidClimb). No extra fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TeamStep {
    pub team_id: String,
    pub step: i32,
    pub delta: i32,
}

/// Chase meter for DeepSeaEscape. No extra fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ChaseState {
    pub distance: f64,
    pub level: i32,
    pub level_count: i32,
    pub correct_ratio: f64,
}

// ============================================================================
// Mode-tagged payload union (pattern: status.rs GameStatus)
// ============================================================================

/// Mode-specific payload body. Tagged union: `{ mode, data }`.
/// Classic and FlowerBattle are unit arms (FlowerBattle body → WP #927).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "mode", content = "data")]
#[ts(export)]
pub enum ExperiencePayload {
    #[serde(rename = "classic")]
    Classic,
    #[serde(rename = "pyramid")]
    Pyramid(PyramidPayload),
    #[serde(rename = "deepSea")]
    DeepSea(DeepSeaPayload),
    /// Placeholder arm — payload shape lands in WP #927.
    #[serde(rename = "flowerBattle")]
    FlowerBattle,
}

/// PyramidClimb payload body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PyramidPayload {
    pub team_steps: Vec<TeamStep>,
}

/// DeepSeaEscape payload body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeaPayload {
    pub chase: ChaseState,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::ExperienceMode;
    use serde_json::json;

    #[test]
    fn experience_phase_wire_values() {
        let phases = [
            (ExperiencePhase::Intro, "intro"),
            (ExperiencePhase::Question, "question"),
            (ExperiencePhase::AnswersLocked, "answers_locked"),
            (ExperiencePhase::Resolution, "resolution"),
            (ExperiencePhase::WorldTransition, "world_transition"),
            (ExperiencePhase::LevelComplete, "level_complete"),
            (ExperiencePhase::GameComplete, "game_complete"),
            (ExperiencePhase::GameFailed, "game_failed"),
        ];
        for (phase, expected) in phases {
            assert_eq!(serde_json::to_value(phase).unwrap(), json!(expected));
        }
    }

    #[test]
    fn experience_payload_tagged_union_no_value_field() {
        let pyramid = ExperiencePayload::Pyramid(PyramidPayload {
            team_steps: vec![TeamStep {
                team_id: "red".into(),
                step: 2,
                delta: 1,
            }],
        });
        let v = serde_json::to_value(&pyramid).unwrap();
        assert_eq!(v["mode"], "pyramid");
        assert!(v.get("data").is_some());
        assert!(v.get("value").is_none());

        let classic = ExperiencePayload::Classic;
        let v = serde_json::to_value(&classic).unwrap();
        assert_eq!(v, json!({"mode": "classic"}));

        let flower = ExperiencePayload::FlowerBattle;
        let v = serde_json::to_value(&flower).unwrap();
        assert_eq!(v, json!({"mode": "flowerBattle"}));
    }

    #[test]
    fn experience_transition_envelope_fields() {
        let t = ExperienceTransition {
            mode: ExperienceMode::PyramidClimb,
            phase: ExperiencePhase::Question,
            phase_started_at_server_ms: 1_700_000_000_000,
            phase_duration_ms: Some(20_000),
            revision: 3,
            payload: ExperiencePayload::Pyramid(PyramidPayload { team_steps: vec![] }),
        };
        let v = serde_json::to_value(&t).unwrap();
        assert_eq!(v["mode"], "pyramidClimb");
        assert_eq!(v["phase"], "question");
        assert_eq!(v["phaseStartedAtServerMs"], 1_700_000_000_000_i64);
        assert_eq!(v["phaseDurationMs"], 20_000);
        assert_eq!(v["revision"], 3);
        assert!(v["payload"].is_object());
        // No question/answer/media/solution free-text keys on the envelope.
        for forbidden in [
            "question",
            "answers",
            "media",
            "solutions",
            "correct",
            "message",
            "value",
        ] {
            assert!(
                v.get(forbidden).is_none(),
                "forbidden key present: {forbidden}"
            );
        }
    }

    #[test]
    fn deep_sea_payload_shape() {
        let p = ExperiencePayload::DeepSea(DeepSeaPayload {
            chase: ChaseState {
                distance: 0.42,
                level: 1,
                level_count: 5,
                correct_ratio: 0.8,
            },
        });
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["mode"], "deepSea");
        assert_eq!(v["data"]["chase"]["distance"], 0.42);
        assert_eq!(v["data"]["chase"]["level"], 1);
        assert_eq!(v["data"]["chase"]["levelCount"], 5);
        assert_eq!(v["data"]["chase"]["correctRatio"], 0.8);
    }
}
