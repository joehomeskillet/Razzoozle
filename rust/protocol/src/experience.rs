//! experience.rs — OWNS: game:experience S2C envelope + mode-specific payloads.
//!
//! WP #876 — Protokoll-Contract Experience-Modi (Wave-0-Freeze)
//! WP #927 — FlowerBattle domain contract (payload body + wire types)
//! Date: 2026-07-30
//!
//! Wire family: `game:experience` with envelope
//!   { mode, phase, phaseStartedAtServerMs, phaseDurationMs, revision, payload }
//!
//! Anti-cheat / scope: NO question text, answer options, media URLs, or solution
//! content may appear in this envelope (those stay on game:status). See status.rs
//! ShowQuestionData / SelectAnswerData for what deliberately stays OUT of here.
//!
//! FlowerBattle mode-specific detail rides the same ExperienceTransition envelope
//! via `ExperiencePayload::FlowerBattle(FlowerBattlePayload)` — no second state machine.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::game::ExperienceMode;

/// Wire recipe version for FlowerBattle background composition (SDD §24/§38).
/// Always `1` — not a free field; clients must not invent other values.
pub const FLOWER_BATTLE_RECIPE_VERSION: i32 = 1;

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
/// Seven structural fields + mode-tagged `payload`. No free-text / media / solution
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
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answered: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub total: Option<i32>,
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
// FlowerBattle domain contract (WP #927)
// ============================================================================

/// FlowerBattle intra-mode phase (SDD §11 — 10 unit variants).
/// Distinct from [`ExperiencePhase`]; rides inside `FlowerBattleState`, not as a
/// second top-level envelope state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum FlowerBattlePhase {
    Start,
    Greeting,
    RoleAssignment,
    Preparation,
    Round1,
    Round2,
    Round3,
    Voting,
    Results,
    End,
}

/// Active temporary effect on a FlowerBattle team.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum FlowerBattleEffect {
    Sunbeam,
    UmbrellaShield,
    AcidRain,
}

/// Deterministic garden-background seed + fixed recipe version.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FlowerBattleBackground {
    pub seed: String,
    /// Always [`FLOWER_BATTLE_RECIPE_VERSION`] (`1`).
    pub recipe_version: i32,
}

/// Offered power-up choice during a FlowerBattle session.
/// `offer_type` is a free string on the contract surface (typed enum later).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PowerupOffer {
    pub id: String,
    pub offer_type: String,
    /// Expiry as server epoch ms (same convention as `phaseStartedAtServerMs`).
    pub expires_at: i64,
}

/// Per-team public battle state (no solution / Q&A content).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FlowerBattleTeamState {
    pub name: String,
    /// Member player UUIDs.
    pub members: Vec<String>,
    pub hp: f32,
    pub shield: i32,
    pub effects: Vec<FlowerBattleEffect>,
}

/// Full FlowerBattle mode state snapshot body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FlowerBattleState {
    pub phase: FlowerBattlePhase,
    pub teams: Vec<FlowerBattleTeamState>,
    pub background: FlowerBattleBackground,
    pub powerups: Vec<PowerupOffer>,
}

/// FlowerBattle payload body inside [`ExperiencePayload`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FlowerBattlePayload {
    pub state: FlowerBattleState,
}

// ============================================================================
// Mode-tagged payload union (pattern: status.rs GameStatus)
// ============================================================================

/// Mode-specific payload body. Tagged union: `{ mode, data }`.
/// Classic remains a unit arm; FlowerBattle carries [`FlowerBattlePayload`].
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
    /// Attachment point for FlowerBattle domain state (WP #927).
    #[serde(rename = "flowerBattle")]
    FlowerBattle(FlowerBattlePayload),
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
    fn flower_battle_phase_wire_values() {
        let phases = [
            (FlowerBattlePhase::Start, "start"),
            (FlowerBattlePhase::Greeting, "greeting"),
            (FlowerBattlePhase::RoleAssignment, "role_assignment"),
            (FlowerBattlePhase::Preparation, "preparation"),
            (FlowerBattlePhase::Round1, "round1"),
            (FlowerBattlePhase::Round2, "round2"),
            (FlowerBattlePhase::Round3, "round3"),
            (FlowerBattlePhase::Voting, "voting"),
            (FlowerBattlePhase::Results, "results"),
            (FlowerBattlePhase::End, "end"),
        ];
        assert_eq!(phases.len(), 10);
        for (phase, expected) in phases {
            assert_eq!(serde_json::to_value(phase).unwrap(), json!(expected));
        }
    }

    #[test]
    fn flower_battle_effect_wire_values() {
        let effects = [
            (FlowerBattleEffect::Sunbeam, "sunbeam"),
            (FlowerBattleEffect::UmbrellaShield, "umbrella_shield"),
            (FlowerBattleEffect::AcidRain, "acid_rain"),
        ];
        for (effect, expected) in effects {
            assert_eq!(serde_json::to_value(effect).unwrap(), json!(expected));
        }
    }

    #[test]
    fn flower_battle_payload_serialization() {
        let p = ExperiencePayload::FlowerBattle(FlowerBattlePayload {
            state: FlowerBattleState {
                phase: FlowerBattlePhase::Round1,
                teams: vec![FlowerBattleTeamState {
                    name: "Rose".into(),
                    members: vec!["uuid-a".into()],
                    hp: 100.0,
                    shield: 0,
                    effects: vec![FlowerBattleEffect::Sunbeam],
                }],
                background: FlowerBattleBackground {
                    seed: "sess-seed-1".into(),
                    recipe_version: FLOWER_BATTLE_RECIPE_VERSION,
                },
                powerups: vec![PowerupOffer {
                    id: "pu-1".into(),
                    offer_type: "sunbeam".into(),
                    expires_at: 1_700_000_000_500,
                }],
            },
        });
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["mode"], "flowerBattle");
        assert_eq!(v["data"]["state"]["phase"], "round1");
        assert_eq!(v["data"]["state"]["background"]["seed"], "sess-seed-1");
        // Hard literal: recipeVersion must wire as 1 (never free).
        assert_eq!(v["data"]["state"]["background"]["recipeVersion"], 1);
        assert_eq!(FLOWER_BATTLE_RECIPE_VERSION, 1);
        assert_eq!(v["data"]["state"]["teams"][0]["name"], "Rose");
        assert_eq!(v["data"]["state"]["teams"][0]["hp"], 100.0);
        assert_eq!(v["data"]["state"]["teams"][0]["effects"][0], "sunbeam");
        assert_eq!(v["data"]["state"]["powerups"][0]["id"], "pu-1");
        assert_eq!(
            v["data"]["state"]["powerups"][0]["expiresAt"],
            1_700_000_000_500_i64
        );
        assert_eq!(v["data"]["state"]["powerups"][0]["offerType"], "sunbeam");
        // Round-trip
        let back: ExperiencePayload = serde_json::from_value(v).unwrap();
        assert_eq!(back, p);
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

        let flower = ExperiencePayload::FlowerBattle(FlowerBattlePayload {
            state: FlowerBattleState {
                phase: FlowerBattlePhase::Start,
                teams: vec![],
                background: FlowerBattleBackground {
                    seed: "x".into(),
                    recipe_version: 1,
                },
                powerups: vec![],
            },
        });
        let v = serde_json::to_value(&flower).unwrap();
        assert_eq!(v["mode"], "flowerBattle");
        assert!(v.get("data").is_some());
        assert!(v.get("value").is_none());
    }

    #[test]
    fn experience_transition_envelope_fields() {
        let t = ExperienceTransition {
            mode: ExperienceMode::PyramidClimb,
            phase: ExperiencePhase::Question,
            phase_started_at_server_ms: 1_700_000_000_000,
            phase_duration_ms: Some(20_000),
            revision: 3,
            answered: Some(7),
            total: Some(12),
            payload: ExperiencePayload::Pyramid(PyramidPayload {
                team_steps: vec![],
            }),
        };
        let v = serde_json::to_value(&t).unwrap();
        assert_eq!(v["mode"], "pyramidClimb");
        assert_eq!(v["phase"], "question");
        assert_eq!(v["phaseStartedAtServerMs"], 1_700_000_000_000_i64);
        assert_eq!(v["phaseDurationMs"], 20_000);
        assert_eq!(v["revision"], 3);
        assert_eq!(v["answered"], 7);
        assert_eq!(v["total"], 12);
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

        let t_without_progress = ExperienceTransition {
            answered: None,
            total: None,
            ..t
        };
        let v = serde_json::to_value(&t_without_progress).unwrap();
        assert!(v.get("answered").is_none());
        assert!(v.get("total").is_none());
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
