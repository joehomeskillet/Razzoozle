//! status.rs — OWNS: Status enum + StatusDataMap discriminated union
//! (the game:status / GAME.STATUS payload), plus RoundRecapAward.
//!

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

// Import Player from sibling module
use crate::player::Player;
use crate::quizz::QuestionMedia;

// RoundRecapKey enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RoundRecapKey {
    FastestFinger,
    FirstCorrect,
    Streak,
    HighestRoundScore,
    RankClimber,
    AchievementUnlock,
    SlowestPlayer,
    MostWrong,
}

/// RoundRecapAward for per-round highlights
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RoundRecapAward {
    pub key: RoundRecapKey,
    pub winner_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub winner_avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub value: Option<i32>,
}

// Status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Status {
    #[serde(rename = "SHOW_ROOM")]
    ShowRoom,
    #[serde(rename = "SHOW_START")]
    ShowStart,
    #[serde(rename = "SHOW_PREPARED")]
    ShowPrepared,
    #[serde(rename = "SHOW_QUESTION")]
    ShowQuestion,
    #[serde(rename = "SELECT_ANSWER")]
    SelectAnswer,
    #[serde(rename = "SHOW_RESULT")]
    ShowResult,
    #[serde(rename = "SHOW_RESPONSES")]
    ShowResponses,
    #[serde(rename = "SHOW_ROUND_RECAP")]
    ShowRoundRecap,
    #[serde(rename = "SHOW_LEADERBOARD")]
    ShowLeaderboard,
    #[serde(rename = "FINISHED")]
    Finished,
    #[serde(rename = "WAIT")]
    Wait,
    #[serde(rename = "PAUSED")]
    Paused,
}

// Data structs for each status variant

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowRoomData {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub invite_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub team_mode: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowStartData {
    pub time: i32,
    pub subject: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowPreparedData {
    pub total_answers: i32,
    pub question_number: i32,
}


#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowQuestionData {
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub display_order: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub media: Option<QuestionMedia>,
    pub cooldown: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub submitted_by: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SelectAnswerData {
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub media: Option<QuestionMedia>,
    pub time: i32,
    pub total_player: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    #[ts(optional)]
    pub question_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub min: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub step: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub shuffled_chunks: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub server_seq: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub server_now_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub question_start_at_server_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answer_deadline_at_server_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub submitted_by: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowResultData {
    pub correct: bool,
    pub message: String,
    pub points: i32,
    pub my_points: i32,
    pub rank: i32,
    pub ahead_of_me: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub streak: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub streak_bonus: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bonus: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub first_correct: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub poll: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub achievements: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bonus_points: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub player_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub correct_answer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub correct_chunks: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub auto_advance_ms: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub round_recap: Option<Vec<RoundRecapAward>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scoring_mode: Option<ScoringMode>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ScoringMode {
    Speed,
    Accuracy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowResponsesData {
    pub question: String,
    pub responses: HashMap<String, i32>,
    pub solutions: Vec<i32>,
    pub answers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub media: Option<QuestionMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    #[ts(optional)]
    pub question_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub correct: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub average_guess: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub text_responses: Option<HashMap<String, i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub accepted_answers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub match_mode: Option<MatchMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub correct_chunks: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub round_recap: Option<Vec<RoundRecapAward>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum MatchMode {
    Exact,
    Normalized,
    Fuzzy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowRoundRecapData {
    pub round_recap: Vec<RoundRecapAward>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShowLeaderboardData {
    pub old_leaderboard: Vec<Player>,
    pub leaderboard: Vec<Player>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub team_standings: Option<Vec<TeamStanding>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub auto_advance_ms: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub round_recap: Option<Vec<RoundRecapAward>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TeamStanding {
    pub team_id: String,
    pub points: i32,
    pub player_count: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FinishedData {
    pub subject: String,
    pub top: Vec<Player>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub rank: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub team_standings: Option<Vec<TeamStanding>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    #[ts(type = "any")]
    pub recap: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub auto_mode: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WaitData {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub team_mode: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PausedData {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reason: Option<String>,
}

/// GameStatus discriminated union: status name + data
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "name", content = "data")]
#[ts(export)]
pub enum GameStatus {
    #[serde(rename = "SHOW_ROOM")]
    ShowRoom(ShowRoomData),
    #[serde(rename = "SHOW_START")]
    ShowStart(ShowStartData),
    #[serde(rename = "SHOW_PREPARED")]
    ShowPrepared(ShowPreparedData),
    #[serde(rename = "SHOW_QUESTION")]
    ShowQuestion(ShowQuestionData),
    #[serde(rename = "SELECT_ANSWER")]
    SelectAnswer(SelectAnswerData),
    #[serde(rename = "SHOW_RESULT")]
    ShowResult(ShowResultData),
    #[serde(rename = "SHOW_RESPONSES")]
    ShowResponses(ShowResponsesData),
    #[serde(rename = "SHOW_ROUND_RECAP")]
    ShowRoundRecap(ShowRoundRecapData),
    #[serde(rename = "SHOW_LEADERBOARD")]
    ShowLeaderboard(ShowLeaderboardData),
    #[serde(rename = "FINISHED")]
    Finished(FinishedData),
    #[serde(rename = "WAIT")]
    Wait(WaitData),
    #[serde(rename = "PAUSED")]
    Paused(PausedData),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_show_start_roundtrip() {
        let json = json!({"name": "SHOW_START", "data": {"time": 5000, "subject": "Quiz"}});
        let status: GameStatus = serde_json::from_value(json.clone()).unwrap();
        match &status {
            GameStatus::ShowStart(d) => assert_eq!(d.time, 5000),
            _ => panic!(),
        }
        assert_eq!(serde_json::to_value(&status).unwrap(), json);
    }

    #[test]
    fn test_show_result_with_recap() {
        let json = json!({
            "name": "SHOW_RESULT",
            "data": {
                "correct": true,
                "message": "OK",
                "points": 100,
                "myPoints": 500,
                "rank": 1,
                "aheadOfMe": null,
                "roundRecap": [{
                    "key": "fastest_finger",
                    "winnerName": "Alice",
                    "value": 1000
                }],
                "scoringMode": "speed"
            }
        });
        let status: GameStatus = serde_json::from_value(json.clone()).unwrap();
        match &status {
            GameStatus::ShowResult(d) => {
                assert!(d.correct);
                assert_eq!(d.round_recap.as_ref().unwrap().len(), 1);
            }
            _ => panic!(),
        }
        assert_eq!(serde_json::to_value(&status).unwrap(), json);
    }
}
