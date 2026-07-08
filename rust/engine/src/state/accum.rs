//! accum.rs — whole-game accumulators for achievements + recap.
//! Mirrors Node round-manager/snapshot.ts:24-49 (GameCounter/RecapStat/QuestionStat).

#[derive(Debug, Clone, Default)]
pub struct GameCounter {
    pub answered: i32,
    pub correct: i32,
    pub ever: bool,
}

#[derive(Debug, Clone, Default)]
pub struct RecapStat {
    pub username: String,
    pub fastest_ms: Option<i64>,
    pub peak_streak: i32,
    pub correct: i32,
    pub wrong: i32,
    pub answered: i32,
    pub best_climb: i32,
    pub worst_rank_ever: i32,
    pub achievement_ids: Vec<String>,
    pub lucky_guess: bool,
}

#[derive(Debug, Clone, Default)]
pub struct QuestionStat {
    pub correct: i32,
    pub total: i32,
}
