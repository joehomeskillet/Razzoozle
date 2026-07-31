//! experience.rs — OWNS: game:experience S2C envelope + mode-specific payloads.
//!
//! WP #876 — Protokoll-Contract Experience-Modi (Wave-0-Freeze)
//! WP #927 — FlowerBattle domain contract (payload body + wire types)
//! WP #930 — FlowerBattle sun-points meter (per-team accumulation)
//! WP #931 — FlowerBattle power-up voting (previous_attacker_team_id)
//! WP #932 — FlowerBattle power-up effect state fields (expires/remaining)
//! WP #999 / WP-FLB-21A — S2C power-up event envelopes (Offered/Selected/Applied/Completed)
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

/// Active temporary status effect on a FlowerBattle team (WP #932).
///
/// Fertilizer is **not** a status — it is applied instantly (+2 growth) and never
/// stored here. Wire shape is internally tagged (`kind` + camelCase fields).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FlowerBattleEffect {
    /// Next base growth ≥1 gets +1; base 0 keeps this status until first ≥1 growth.
    Sunbeam {
        #[serde(rename = "expiresAfterQuestionId")]
        expires_after_question_id: i32,
    },
    /// Blocks exactly one negative effect, or expires after `remaining_questions`
    /// answered-question ticks (starts at 2).
    UmbrellaShield {
        #[serde(rename = "remainingQuestions")]
        remaining_questions: u8,
    },
    /// Next positive growth of the victim team is reduced by 1 (min 0), then consumed.
    /// If an umbrella shield is active on the victim when acid would apply, both are
    /// consumed and no penalty lands.
    AcidRain {
        #[serde(rename = "sourceTeamId")]
        source_team_id: String,
        #[serde(rename = "expiresAfterQuestionId")]
        expires_after_question_id: i32,
    },
}

impl FlowerBattleEffect {
    /// Discriminator key matching wire `kind` / offer option ids.
    pub fn kind_key(&self) -> &'static str {
        match self {
            Self::Sunbeam { .. } => "sunbeam",
            Self::UmbrellaShield { .. } => "umbrella_shield",
            Self::AcidRain { .. } => "acid_rain",
        }
    }

    #[inline]
    pub fn is_sunbeam(&self) -> bool {
        matches!(self, Self::Sunbeam { .. })
    }

    #[inline]
    pub fn is_umbrella_shield(&self) -> bool {
        matches!(self, Self::UmbrellaShield { .. })
    }

    #[inline]
    pub fn is_acid_rain(&self) -> bool {
        matches!(self, Self::AcidRain { .. })
    }

    /// Negative statuses (max one per target team).
    #[inline]
    pub fn is_negative(&self) -> bool {
        self.is_acid_rain()
    }

    pub fn sunbeam(expires_after_question_id: i32) -> Self {
        Self::Sunbeam {
            expires_after_question_id,
        }
    }

    pub fn umbrella_shield(remaining_questions: u8) -> Self {
        Self::UmbrellaShield {
            remaining_questions,
        }
    }

    pub fn acid_rain(source_team_id: impl Into<String>, expires_after_question_id: i32) -> Self {
        Self::AcidRain {
            source_team_id: source_team_id.into(),
            expires_after_question_id,
        }
    }
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
    /// Cumulative plant growth stage (0..=10); win at 10 (WP #933).
    pub growth_stage: i32,
    /// Accumulated sun points for power-up triggers (WP #930).
    pub sun_points: i32,
    /// Last team that successfully acid_rain-attacked this team (WP #931).
    /// Used to block back-to-back attacks from the same attacker team.
    /// `None` when never attacked (or after any reset policy lands later).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub previous_attacker_team_id: Option<String>,
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

/// Personalized FlowerBattle state for one player.
///
/// Emitted only to the player's current socket on
/// `game:flowerBattle:playerStatus`. Team assignment and all battle values are
/// server-authoritative; clients must not infer a team from the public snapshot.
/// `revision` is a server-issued monotonic LWW ticket encoded as a canonical
/// decimal string so the full persisted `u64` range stays exact in JavaScript.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FlowerBattlePlayerStatus {
    pub game_id: String,
    pub revision: String,
    pub question_index: i32,
    pub team_id: Option<String>,
    pub growth_stage: u8,
    pub max_growth_stage: u8,
    pub sun_points: u8,
    pub active_effects: Vec<FlowerBattleEffect>,
    pub victory_resolved: bool,
    pub winner_team_ids: Vec<String>,
    pub is_winner: bool,
}

// ============================================================================
// FlowerBattle power-up vote C2S (WP #931 / SEC-01)
// ============================================================================

/// C2S payload for `player:flowerBattle:submitPowerupVote`.
///
/// `player_token` is **required** on the wire (SEC-01): server matches it against
/// the stored token for the socket's clientId before recording the vote.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PowerupVotePayload {
    pub game_id: String,
    /// Index into the active offer option list.
    pub option_index: usize,
    /// Server-minted per-player secret from `game:successJoin` / localStorage.
    pub player_token: String,
}

/// C2S payload for `player:flowerBattle:submitPowerupTargetVote`.
///
/// `player_token` is **required** (SEC-01) — same gate as [`PowerupVotePayload`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TargetVotePayload {
    pub game_id: String,
    pub target_team_id: String,
    /// Server-minted per-player secret from `game:successJoin` / localStorage.
    pub player_token: String,
}

// ============================================================================
// FlowerBattle power-up S2C envelopes (WP #999 / WP-FLB-21A)
// ============================================================================
// Event names stay in `constants::flower_battle` and TS EVENTS.FLOWER_BATTLE.
// Wire shapes only here — no engine import (avoid crate cycle); applied result
// is a stable protocol-local tagged union mirroring engine semantics.

/// S2C `game:flowerBattle:powerupOffered`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PowerupOffered {
    pub game_id: String,
    pub team_id: String,
    pub offer: PowerupOffer,
}

/// S2C `game:flowerBattle:powerupSelected`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PowerupSelected {
    pub game_id: String,
    pub team_id: String,
    pub offer_id: String,
    /// Index into the active offer option list.
    pub option_index: usize,
    pub option_id: String,
    /// Server epoch ms — anchors client-side target-vote window.
    #[ts(type = "number")]
    pub selected_at_server_ms: i64,
}

/// Stable wire shape for the power-up application result.
///
/// Protocol-local (not engine `AppliedEffect`) so clients get a typed tagged
/// union without pulling engine into the protocol crate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PowerupAppliedResult {
    /// Instant stage bump (no lasting status).
    Fertilizer {
        #[serde(rename = "growthStage")]
        growth_stage: u8,
    },
    /// Status stored on the (possibly different) target team.
    Status {
        #[serde(rename = "teamId")]
        team_id: String,
        effect: FlowerBattleEffect,
    },
    /// Placeholder after snapshot restore (offer id known; payload not rehydrated).
    RestoredIdempotent,
}

/// S2C `game:flowerBattle:powerupApplied`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PowerupApplied {
    pub game_id: String,
    pub source_team_id: String,
    pub option_id: String,
    /// Absent for self-buffs (fertilizer / sunbeam / umbrella_shield).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub target_team_id: Option<String>,
    pub applied: PowerupAppliedResult,
}

/// S2C `game:flowerBattle:gameCompleted`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FlowerBattleCompleted {
    pub game_id: String,
    pub winner_team_ids: Vec<String>,
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
        // Internally tagged objects (WP #932 status payloads).
        assert_eq!(
            serde_json::to_value(FlowerBattleEffect::sunbeam(7)).unwrap(),
            json!({"kind": "sunbeam", "expiresAfterQuestionId": 7})
        );
        assert_eq!(
            serde_json::to_value(FlowerBattleEffect::umbrella_shield(2)).unwrap(),
            json!({"kind": "umbrella_shield", "remainingQuestions": 2})
        );
        assert_eq!(
            serde_json::to_value(FlowerBattleEffect::acid_rain("red", 3)).unwrap(),
            json!({
                "kind": "acid_rain",
                "sourceTeamId": "red",
                "expiresAfterQuestionId": 3
            })
        );
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
                    effects: vec![FlowerBattleEffect::sunbeam(0)],
                    growth_stage: 4,
                    sun_points: 2,
                    previous_attacker_team_id: Some("Violet".into()),
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
        assert_eq!(
            v["data"]["state"]["teams"][0]["effects"][0]["kind"],
            "sunbeam"
        );
        assert_eq!(
            v["data"]["state"]["teams"][0]["effects"][0]["expiresAfterQuestionId"],
            0
        );
        assert_eq!(v["data"]["state"]["teams"][0]["sunPoints"], 2);
        assert_eq!(
            v["data"]["state"]["teams"][0]["previousAttackerTeamId"],
            "Violet"
        );
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
    fn flower_battle_player_status_serialization_is_camel_case_and_structured() {
        let status = FlowerBattlePlayerStatus {
            game_id: "game-1".into(),
            revision: "42".into(),
            question_index: 2,
            team_id: Some("blue".into()),
            growth_stage: 7,
            max_growth_stage: 10,
            sun_points: 3,
            active_effects: vec![
                FlowerBattleEffect::umbrella_shield(1),
                FlowerBattleEffect::acid_rain("red", 0),
            ],
            victory_resolved: true,
            winner_team_ids: vec!["blue".into(), "green".into()],
            is_winner: true,
        };

        let value = serde_json::to_value(status).unwrap();
        assert_eq!(value["revision"], "42");
        assert_eq!(value["gameId"], "game-1");
        assert_eq!(value["questionIndex"], 2);
        assert_eq!(value["teamId"], "blue");
        assert_eq!(value["growthStage"], 7);
        assert_eq!(value["maxGrowthStage"], 10);
        assert_eq!(value["sunPoints"], 3);
        assert_eq!(value["activeEffects"][0]["kind"], "umbrella_shield");
        assert_eq!(value["activeEffects"][1]["sourceTeamId"], "red");
        assert_eq!(value["winnerTeamIds"], json!(["blue", "green"]));
        assert_eq!(value["isWinner"], true);
        assert!(value.get("game_id").is_none());
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
            payload: ExperiencePayload::Pyramid(PyramidPayload { team_steps: vec![] }),
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
    fn powerup_vote_payload_requires_player_token() {
        let p = PowerupVotePayload {
            game_id: "g1".into(),
            option_index: 1,
            player_token: "tok-a".into(),
        };
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["gameId"], "g1");
        assert_eq!(v["optionIndex"], 1);
        assert_eq!(v["playerToken"], "tok-a");
        let back: PowerupVotePayload = serde_json::from_value(v).unwrap();
        assert_eq!(back, p);

        // Missing playerToken must fail deserialize (SEC-01 required field).
        let missing = json!({"gameId": "g1", "optionIndex": 0});
        assert!(serde_json::from_value::<PowerupVotePayload>(missing).is_err());
    }

    #[test]
    fn target_vote_payload_requires_player_token() {
        let p = TargetVotePayload {
            game_id: "g1".into(),
            target_team_id: "blue".into(),
            player_token: "tok-b".into(),
        };
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["gameId"], "g1");
        assert_eq!(v["targetTeamId"], "blue");
        assert_eq!(v["playerToken"], "tok-b");
        let back: TargetVotePayload = serde_json::from_value(v).unwrap();
        assert_eq!(back, p);

        let missing = json!({"gameId": "g1", "targetTeamId": "blue"});
        assert!(serde_json::from_value::<TargetVotePayload>(missing).is_err());
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

    // -------------------------------------------------------------------------
    // WP-FLB-21A / #999 — S2C power-up event envelopes (golden serde)
    // -------------------------------------------------------------------------

    #[test]
    fn powerup_offered_s2c_golden() {
        let offered = PowerupOffered {
            game_id: "g1".into(),
            team_id: "blue".into(),
            offer: PowerupOffer {
                id: "offer-1".into(),
                offer_type: "fertilizer,sunbeam,acid_rain".into(),
                expires_at: 1_700_000_000_500,
            },
        };
        let v = serde_json::to_value(&offered).unwrap();
        assert_eq!(
            v,
            json!({
                "gameId": "g1",
                "teamId": "blue",
                "offer": {
                    "id": "offer-1",
                    "offerType": "fertilizer,sunbeam,acid_rain",
                    "expiresAt": 1_700_000_000_500_i64
                }
            })
        );
        // No Q&A / secret fields on this envelope.
        for forbidden in ["question", "answers", "playerToken", "secret", "correct"] {
            assert!(v.get(forbidden).is_none(), "forbidden key: {forbidden}");
        }
        let back: PowerupOffered = serde_json::from_value(v).unwrap();
        assert_eq!(back, offered);
    }

    #[test]
    fn powerup_selected_s2c_golden() {
        let selected = PowerupSelected {
            game_id: "g1".into(),
            team_id: "blue".into(),
            offer_id: "offer-1".into(),
            option_index: 1,
            option_id: "sunbeam".into(),
            selected_at_server_ms: 1_700_000_001_000,
        };
        let v = serde_json::to_value(&selected).unwrap();
        assert_eq!(
            v,
            json!({
                "gameId": "g1",
                "teamId": "blue",
                "offerId": "offer-1",
                "optionIndex": 1,
                "optionId": "sunbeam",
                "selectedAtServerMs": 1_700_000_001_000_i64
            })
        );
        let back: PowerupSelected = serde_json::from_value(v).unwrap();
        assert_eq!(back, selected);
    }

    #[test]
    fn powerup_applied_s2c_golden_fertilizer_and_status() {
        // Self-buff: no targetTeamId; applied = fertilizer instant growth.
        let fert = PowerupApplied {
            game_id: "g1".into(),
            source_team_id: "blue".into(),
            option_id: "fertilizer".into(),
            target_team_id: None,
            applied: PowerupAppliedResult::Fertilizer { growth_stage: 4 },
        };
        let v = serde_json::to_value(&fert).unwrap();
        assert_eq!(
            v,
            json!({
                "gameId": "g1",
                "sourceTeamId": "blue",
                "optionId": "fertilizer",
                "applied": { "kind": "fertilizer", "growthStage": 4 }
            })
        );
        assert!(v.get("targetTeamId").is_none());
        let back: PowerupApplied = serde_json::from_value(v).unwrap();
        assert_eq!(back, fert);

        // Targeted status: acid_rain with targetTeamId + applied status arm.
        let acid = PowerupApplied {
            game_id: "g1".into(),
            source_team_id: "blue".into(),
            option_id: "acid_rain".into(),
            target_team_id: Some("red".into()),
            applied: PowerupAppliedResult::Status {
                team_id: "red".into(),
                effect: FlowerBattleEffect::acid_rain("blue", 0),
            },
        };
        let v = serde_json::to_value(&acid).unwrap();
        assert_eq!(
            v,
            json!({
                "gameId": "g1",
                "sourceTeamId": "blue",
                "optionId": "acid_rain",
                "targetTeamId": "red",
                "applied": {
                    "kind": "status",
                    "teamId": "red",
                    "effect": {
                        "kind": "acid_rain",
                        "sourceTeamId": "blue",
                        "expiresAfterQuestionId": 0
                    }
                }
            })
        );
        let back: PowerupApplied = serde_json::from_value(v).unwrap();
        assert_eq!(back, acid);

        // Restored idempotent placeholder (reconnect / snapshot path).
        let restored = PowerupApplied {
            game_id: "g1".into(),
            source_team_id: "blue".into(),
            option_id: "sunbeam".into(),
            target_team_id: None,
            applied: PowerupAppliedResult::RestoredIdempotent,
        };
        let v = serde_json::to_value(&restored).unwrap();
        assert_eq!(
            v,
            json!({
                "gameId": "g1",
                "sourceTeamId": "blue",
                "optionId": "sunbeam",
                "applied": { "kind": "restored_idempotent" }
            })
        );
        let back: PowerupApplied = serde_json::from_value(v).unwrap();
        assert_eq!(back, restored);
    }

    #[test]
    fn flower_battle_completed_s2c_golden() {
        let completed = FlowerBattleCompleted {
            game_id: "g1".into(),
            winner_team_ids: vec!["blue".into(), "green".into()],
        };
        let v = serde_json::to_value(&completed).unwrap();
        assert_eq!(
            v,
            json!({
                "gameId": "g1",
                "winnerTeamIds": ["blue", "green"]
            })
        );
        for forbidden in ["question", "answers", "secret", "playerToken", "teams"] {
            assert!(v.get(forbidden).is_none(), "forbidden key: {forbidden}");
        }
        let back: FlowerBattleCompleted = serde_json::from_value(v).unwrap();
        assert_eq!(back, completed);
    }
}
