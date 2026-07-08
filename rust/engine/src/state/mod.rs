//! state.rs — IO-free game phase state machine.

use crate::eval::{self, AnswerInput};
use crate::scoring::{apply_first_correct_bonus, calculate_points};
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::{Question, QuestionType, Quizz};
use razzoozle_protocol::status::{
    ScoringMode, ShowLeaderboardData, ShowQuestionData, ShowStartData,
};
use std::collections::HashMap;

mod results;
pub use results::RoundResult;
mod accum;
pub use accum::*;
mod recap;
mod achievement_awards;
pub use achievement_awards::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GamePhase {
    ShowRoom,
    ShowStart,
    ShowQuestion,
    SelectAnswer,
    ShowResult,
    ShowLeaderboard,
    Finished,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GameError {
    InvalidTransition { from: GamePhase, action: &'static str },
    NoPlayers,
    InvalidQuestionIndex { index: usize, total: usize },
    UnknownPlayer { client_id: String },
    DuplicateAnswer { client_id: String },
    InvalidAnswerShape { client_id: String },
}

impl std::fmt::Display for GameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidTransition { from, action } => {
                write!(f, "cannot {action} while in {from:?}")
            }
            Self::NoPlayers => write!(f, "at least one player is required"),
            Self::InvalidQuestionIndex { index, total } => {
                write!(f, "question index {index} out of range (total {total})")
            }
            Self::UnknownPlayer { client_id } => {
                write!(f, "unknown player {client_id}")
            }
            Self::DuplicateAnswer { client_id } => {
                write!(f, "player {client_id} already answered")
            }
            Self::InvalidAnswerShape { client_id } => {
                write!(f, "player {client_id} sent an answer payload shape invalid for this question type")
            }
        }
    }
}

impl std::error::Error for GameError {}

#[derive(Debug, Clone, PartialEq)]
pub struct Answer {
    pub answer_input: AnswerInput,
    pub response_time_ms: i64,
}

#[derive(Debug, Clone)]
pub struct GameState {
    pub phase: GamePhase,
    pub quiz: Quizz,
    pub players: Vec<Player>,
    pub current_question_index: usize,
    pub current_answers: HashMap<String, Answer>,
    pub answer_order: Vec<String>,
    pub old_leaderboard: Vec<Player>,
    pub last_round_results: Vec<RoundResult>,
    pub scoring_mode: ScoringMode,
    pub clock_ms: i64,
    question_opened_at_ms: i64,
    pub last_round_rank_before: HashMap<String, i32>,
    pub game_counters: HashMap<String, GameCounter>,
    pub recap_stats: HashMap<String, RecapStat>,
    pub question_stats: HashMap<i32, QuestionStat>,
    pub questions_history: Vec<razzoozle_protocol::results_display::QuestionResult>,
    pub achievements_config: HashMap<String, crate::achievements::MergedAchievement>,
    pub randomize_answers: bool,
    pub current_display_order: Option<Vec<i32>>,
}

impl GameState {
    pub fn new(quiz: Quizz, players: Vec<Player>) -> Self {
        Self {
            phase: GamePhase::ShowRoom,
            quiz,
            players,
            current_question_index: 0,
            current_answers: HashMap::new(),
            answer_order: Vec::new(),
            old_leaderboard: Vec::new(),
            last_round_results: Vec::new(),
            scoring_mode: ScoringMode::Speed,
            clock_ms: 0,
            question_opened_at_ms: 0,
            last_round_rank_before: HashMap::new(),
            game_counters: HashMap::new(),
            recap_stats: HashMap::new(),
            question_stats: HashMap::new(),
            questions_history: Vec::new(),
            achievements_config: crate::achievements::default_config(),
            randomize_answers: false,
            current_display_order: None,
        }
    }

    /// Test helper: advance the internal server clock.
    pub fn set_clock_ms(&mut self, ms: i64) {
        self.clock_ms = ms;
    }

    /// Set the achievements configuration (typically injected from DB by server).
    pub fn set_achievements_config(&mut self, cfg: HashMap<String, crate::achievements::MergedAchievement>) {
        self.achievements_config = cfg;
    }


    pub fn set_randomize_answers(&mut self, v: bool) {
        self.randomize_answers = v;
    }
    pub fn start(&mut self) -> Result<ShowStartData, GameError> {
        if self.phase != GamePhase::ShowRoom {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "start",
            });
        }
        if self.players.is_empty() {
            return Err(GameError::NoPlayers);
        }

        self.phase = GamePhase::ShowStart;
        Ok(ShowStartData {
            // Seconds, not ms — matches Node's `{time: 3, subject}` broadcast
            // (round-manager.ts start(), which then `sleep(3)`s before the
            // real 3s START_COOLDOWN).
            time: 3,
            subject: self.quiz.subject.clone(),
        })
    }

    pub fn show_question(&mut self, question_index: usize) -> Result<ShowQuestionData, GameError> {
        let allowed = matches!(
            self.phase,
            GamePhase::ShowStart | GamePhase::ShowLeaderboard
        );
        if !allowed {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "show_question",
            });
        }
        if question_index >= self.quiz.questions.len() {
            return Err(GameError::InvalidQuestionIndex {
                index: question_index,
                total: self.quiz.questions.len(),
            });
        }

        self.current_question_index = question_index;
        self.current_answers.clear();
        self.answer_order.clear();
        self.last_round_results.clear();
        self.phase = GamePhase::ShowQuestion;

        // Compute display_order if randomizeAnswers is enabled
        let n = self.current_question().answers.as_ref().map(|a| a.len()).unwrap_or(0);
        let is_slider = self.current_question().r#type == Some(QuestionType::Slider);
        self.current_display_order = if self.randomize_answers && !is_slider && n > 1 {
            use rand::Rng;
            let mut order: Vec<i32> = (0..n as i32).collect();
            let mut rng = rand::thread_rng();
            for i in (1..order.len()).rev() {
                let j = rng.gen_range(0..=i);
                order.swap(i, j);
            }
            Some(order)
        } else {
            None
        };

        Ok(self.build_show_question_data())
    }

    pub fn open_answers(&mut self) -> Result<(), GameError> {
        if self.phase != GamePhase::ShowQuestion {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "open_answers",
            });
        }

        self.question_opened_at_ms = self.clock_ms;
        self.phase = GamePhase::SelectAnswer;
        Ok(())
    }

    pub fn record_answer(
        &mut self,
        client_id: &str,
        answer_key: Option<i32>,
        answer_keys: Option<Vec<i32>>,
        answer_text: Option<String>,
    ) -> Result<(), GameError> {
        if self.phase != GamePhase::SelectAnswer {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "record_answer",
            });
        }
        if !self.players.iter().any(|p| p.client_id == *client_id) {
            return Err(GameError::UnknownPlayer {
                client_id: client_id.to_string(),
            });
        }
        if self.current_answers.contains_key(client_id) {
            return Err(GameError::DuplicateAnswer {
                client_id: client_id.to_string(),
            });
        }

        // Per-question-type payload guards (parity with round-manager.ts
        // selectAnswer() ANTI-CHEAT checks, lines ~1147-1192) — unconditional,
        // independent of low-latency mode: multiple-select MUST carry an
        // answer_keys array, any other type must NOT, and type-answer /
        // sentence-builder require non-empty trimmed text.
        let question_type = self.current_question().r#type.clone();
        let is_multi_select = question_type == Some(QuestionType::MultipleSelect);
        let is_text_answer = matches!(
            question_type,
            Some(QuestionType::TypeAnswer) | Some(QuestionType::SentenceBuilder)
        );
        let trimmed_text_is_empty = answer_text.as_deref().map(str::trim).unwrap_or("").is_empty();

        if is_multi_select && answer_keys.is_none() {
            return Err(GameError::InvalidAnswerShape {
                client_id: client_id.to_string(),
            });
        }
        if !is_multi_select && answer_keys.is_some() {
            return Err(GameError::InvalidAnswerShape {
                client_id: client_id.to_string(),
            });
        }
        if is_text_answer && trimmed_text_is_empty {
            return Err(GameError::InvalidAnswerShape {
                client_id: client_id.to_string(),
            });
        }

        let response_time_ms = self.clock_ms - self.question_opened_at_ms;
        self.current_answers.insert(
            client_id.to_string(),
            Answer {
                answer_input: AnswerInput {
                    answer_key,
                    answer_keys,
                    answer_text,
                },
                response_time_ms,
            },
        );
        self.answer_order.push(client_id.to_string());
        Ok(())
    }

    pub fn reveal(&mut self, scoring_mode: ScoringMode) -> Result<Vec<RoundResult>, GameError> {
        if self.phase != GamePhase::SelectAnswer {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "reveal",
            });
        }

        self.scoring_mode = scoring_mode;
        let question = self.current_question().clone();

        // Gate first_correct calculation on practice: if this is a practice question,
        // don't award first_correct bonus (matches Node.js behavior at round-manager.ts ~1248)
        let first_correct_id = if question.practice != Some(true) {
            self
                .answer_order
                .iter()
                .find(|client_id| {
                    self.current_answers
                        .get(*client_id)
                        .is_some_and(|answer| {
                            eval::evaluate_answer(&question, &answer.answer_input).correct
                        })
                })
                .cloned()
        } else {
            None
        };

        // STEP 2: Snapshot rankBefore (pre-scoring rank order, by points descending)
        let mut rank_before_vec: Vec<(String, i32)> = self.players.iter()
            .map(|p| (p.client_id.clone(), p.points))
            .collect();
        rank_before_vec.sort_by(|a, b| b.1.cmp(&a.1));
        self.last_round_rank_before.clear();
        for (idx, (client_id, _)) in rank_before_vec.iter().enumerate() {
            self.last_round_rank_before.insert(client_id.clone(), (idx + 1) as i32);
        }

        let mut results = Vec::new();

        for player in &mut self.players {
            let answer = self.current_answers.get(&player.client_id);
            let eval_result = answer
                .as_ref()
                .map(|a| eval::evaluate_answer(&question, &a.answer_input));
            let correct = eval_result.as_ref().is_some_and(|r| r.correct);
            let base_factor = eval_result.as_ref().map(|r| r.base).unwrap_or(0.0);
            let response_time_ms = answer.map(|a| a.response_time_ms).unwrap_or(0);
            let answered = answer.is_some();
            let streak_before = player.streak;

            let mut points = if let Some(answer) = answer {
                calculate_points(
                    correct,
                    base_factor,
                    answer.response_time_ms,
                    question.time,
                    streak_before,
                    &question,
                    scoring_mode,
                )
            } else {
                0
            };

            let first_correct = first_correct_id.as_deref() == Some(player.client_id.as_str());
            if first_correct && correct {
                points = apply_first_correct_bonus(points, base_factor);
            }

            if question.practice != Some(true) {
                player.points += points;
                player.streak = if correct {
                    streak_before + 1
                } else {
                    0
                };
            }

            results.push(RoundResult {
                client_id: player.client_id.clone(),
                correct,
                points,
                streak: player.streak,
                first_correct,
                response_time_ms,
                answered,
                achievements: Vec::new(),
                bonus_points: 0,
            });
        }

        // WP-S: append this question + all player answers to whole-game history
        // (Node parity: round-manager/results-broadcast.ts:228). Non-bot players
        // only. Once per question — reveal() is phase-guarded, sole caller
        // reveal_helpers.rs:33.
        let player_answers: Vec<razzoozle_protocol::results_display::PlayerAnswerRecord> = self
            .players
            .iter()
            .filter(|p| p.is_bot != Some(true))
            .map(|p| {
                let a = self.current_answers.get(&p.client_id);
                razzoozle_protocol::results_display::PlayerAnswerRecord {
                    player_name: p.username.clone(),
                    answer_id: a.and_then(|ans| ans.answer_input.answer_key),
                    answer_ids: a.and_then(|ans| ans.answer_input.answer_keys.clone()),
                    answer_text: a.and_then(|ans| ans.answer_input.answer_text.clone()),
                    response_ms: a.map(|ans| ans.response_time_ms as i32),
                }
            })
            .collect();
        self.questions_history
            .push(razzoozle_protocol::results_display::QuestionResult {
                question: serde_json::to_value(&question)
                    .unwrap_or_else(|_| serde_json::json!({})),
                player_answers,
            });

        // === N4 recap/question fold (begin) ===
        // Only fold for scored (non-practice) rounds
        if question.practice != Some(true) {
            // Compute rank_after map (from PRE-bonus points — N3 bonus fold runs after)
            let mut rank_after_vec: Vec<(String, i32)> = self.players
                .iter()
                .map(|p| (p.client_id.clone(), p.points))
                .collect();
            rank_after_vec.sort_by(|a, b| {
                b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0))
            });
            let rank_after_map: HashMap<String, i32> = rank_after_vec
                .iter()
                .enumerate()
                .map(|(idx, (cid, _))| (cid.clone(), (idx + 1) as i32))
                .collect();

            // Fold per-player recap_stats + question_stats
            for (i, player) in self.players.iter().enumerate() {
                // Skip bots
                if player.is_bot == Some(true) {
                    continue;
                }

                let result = &results[i];
                let rank_before = self.last_round_rank_before.get(&player.client_id).copied().unwrap_or(0);
                let rank_after = rank_after_map.get(&player.client_id).copied().unwrap_or(0);

                let stat = self.recap_stats.entry(player.client_id.clone()).or_insert_with(|| {
                    crate::state::RecapStat {
                        username: player.username.clone(),
                        fastest_ms: None,
                        peak_streak: 0,
                        correct: 0,
                        wrong: 0,
                        answered: 0,
                        best_climb: 0,
                        worst_rank_ever: 0,
                        achievement_ids: Vec::new(),
                        lucky_guess: false,
                    }
                });

                // Update recap_stats
                if result.answered {
                    stat.answered += 1;
                    // fastest_ms: fastest ANSWERED response (Node parity, not correct-only)
                    if stat.fastest_ms.is_none() || result.response_time_ms < stat.fastest_ms.unwrap() {
                        stat.fastest_ms = Some(result.response_time_ms);
                    }
                    if result.correct {
                        stat.correct += 1;
                    } else {
                        stat.wrong += 1;
                    }
                }
                // lucky_guess: a correct answer landing in the last ~10% of the timer.
                if result.answered
                    && result.correct
                    && (result.response_time_ms as f64) >= 0.9 * question.time as f64 * 1000.0
                {
                    stat.lucky_guess = true;
                }

                // peak_streak: track highest streak reached
                if result.streak > stat.peak_streak {
                    stat.peak_streak = result.streak;
                }

                // best_climb: max rank improvement in single round
                let climb = rank_before - rank_after;
                if climb > stat.best_climb {
                    stat.best_climb = climb;
                }

                // worst_rank_ever: max rank (worst position) ever reached
                if rank_after > stat.worst_rank_ever {
                    stat.worst_rank_ever = rank_after;
                }

                // question_stats: per-question total and correct counts
                let q_stat = self.question_stats.entry(self.current_question_index as i32).or_insert_with(|| {
                    crate::state::QuestionStat {
                        correct: 0,
                        total: 0,
                    }
                });
                if result.answered {
                    q_stat.total += 1;
                    if result.correct {
                        q_stat.correct += 1;
                    }
                }
            }
        }
        // === N4 recap/question fold (end) ===

        // === N3 achievements fold (begin) ===
        // Runs AFTER the N4 recap fold so recap rank_after stays pre-bonus (Node
        // parity: achievement bonus mutates points here, the final leaderboard
        // reflects it, but the recap's internal rank_after does not).
        // Build AwardRow structs for each player, sorted DESC by points_after (results order)
        let mut award_rows: Vec<AwardRow> = Vec::new();
        for (_idx, result) in results.iter().enumerate() {
            if let Some(player) = self.players.iter().find(|p| p.client_id == result.client_id) {
                award_rows.push(AwardRow {
                    client_id: result.client_id.clone(),
                    is_bot: player.is_bot == Some(true),
                    scored: question.practice != Some(true),
                    is_correct: result.correct,
                    base_factor: {
                        self.current_answers
                            .get(&result.client_id)
                            .and_then(|a| {
                                eval::evaluate_answer(&question, &a.answer_input)
                                    .base
                                    .into()
                            })
                            .unwrap_or(0.0)
                    },
                    streak_after: result.streak,
                    response_time_ms: if result.answered { Some(result.response_time_ms) } else { None },
                    points_before: self.last_round_rank_before
                        .get(&result.client_id)
                        .and_then(|_rank_before| {
                            // Infer points_before from rank_before (rough — ideally from snapshot)
                            // For now, use the player's previous points state
                            self.old_leaderboard.iter()
                                .find(|p| p.client_id == result.client_id)
                                .map(|p| p.points)
                        })
                        .unwrap_or(0),
                    points_after: self.players
                        .iter()
                        .find(|p| p.client_id == result.client_id)
                        .map(|p| p.points)
                        .unwrap_or(0),
                });
            }
        }

        // Stable sort DESC by points_after (they should already be in this order, but ensure it)
        award_rows.sort_by(|a, b| b.points_after.cmp(&a.points_after));

        // Calculate metadata
        let total_scored = self.quiz.questions.iter()
            .filter(|q| q.practice != Some(true))
            .count() as i32;
        let is_last_scored = question.practice != Some(true)
            && self.current_question_index + 1 == self.quiz.questions.len();
        let has_prior = self.current_question_index > 0;

        // Compute achievements (Pass A: unlocks, Pass B: bonus)
        let (unlocked_by_client, bonus_by_client) = compute_achievement_awards(
            &self.achievements_config,
            &mut self.game_counters,
            &award_rows,
            &self.last_round_rank_before,
            has_prior,
            first_correct_id.as_deref(),
            is_last_scored,
            total_scored,
            &question,
        );

        // Fold bonus into player.points and results
        for (client_id, bonus) in bonus_by_client.iter() {
            if *bonus > 0 {
                // Update live player points
                if let Some(player) = self.players.iter_mut().find(|p| p.client_id == *client_id) {
                    player.points += bonus;
                }

                // Update result points and set achievements/bonus
                if let Some(result) = results.iter_mut().find(|r| r.client_id == *client_id) {
                    result.points += bonus;
                    if let Some(unlocked) = unlocked_by_client.get(client_id) {
                        result.achievements = unlocked.clone();
                    }
                    result.bonus_points = *bonus;
                }
            } else if let Some(unlocked) = unlocked_by_client.get(client_id) {
                if !unlocked.is_empty() {
                    if let Some(result) = results.iter_mut().find(|r| r.client_id == *client_id) {
                        result.achievements = unlocked.clone();
                    }
                }
            }
        }

        // Handle unlocked badges with no bonus
        for (client_id, unlocked) in unlocked_by_client.iter() {
            if !bonus_by_client.contains_key(client_id) && !unlocked.is_empty() {
                if let Some(result) = results.iter_mut().find(|r| r.client_id == *client_id) {
                    result.achievements = unlocked.clone();
                }
            }
        }
        // Enrich recap_stats with unlocked achievement ids (Node achievement-awards.ts:335;
        // feeds the most_achievements superlative). Entries created by the N4 recap fold above.
        for (cid, ids) in unlocked_by_client.iter() {
            if let Some(stat) = self.recap_stats.get_mut(cid) {
                for id in ids {
                    if !stat.achievement_ids.contains(id) {
                        stat.achievement_ids.push(id.clone());
                    }
                }
                if stat.achievement_ids.len() > 50 {
                    stat.achievement_ids.truncate(50);
                }
            }
        }

        // === N3 achievements fold (end) ===

        self.last_round_results = results.clone();
        self.phase = GamePhase::ShowResult;
        Ok(results)
    }

    pub fn leaderboard_view(&mut self) -> Result<ShowLeaderboardData, GameError> {
        if self.phase != GamePhase::ShowResult {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "leaderboard_view",
            });
        }

        self.old_leaderboard = self.players.clone();
        let leaderboard = self.sorted_leaderboard();
        self.players = leaderboard.clone();

        // Last round: Node's showLeaderboard() (round-manager.ts:1778-1882)
        // skips the intermediate SHOW_LEADERBOARD screen entirely and jumps
        // straight to FINISHED/podium. Result persistence for that finish
        // path is a separate, later WP — this only fixes the phase
        // transition so callers don't get a spurious extra leaderboard hop
        // on the last question.
        let is_last_round = self.current_question_index + 1 == self.quiz.questions.len();
        self.phase = if is_last_round {
            GamePhase::Finished
        } else {
            GamePhase::ShowLeaderboard
        };

        Ok(ShowLeaderboardData {
            old_leaderboard: self.old_leaderboard.clone(),
            leaderboard,
            team_standings: None,
            auto_advance_ms: None,
            round_recap: None,
        })
    }

    pub fn next_or_finish(&mut self) -> Result<GamePhase, GameError> {
        if self.phase != GamePhase::ShowLeaderboard {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "next_or_finish",
            });
        }

        let next_index = self.current_question_index + 1;
        if next_index >= self.quiz.questions.len() {
            self.phase = GamePhase::Finished;
            return Ok(GamePhase::Finished);
        }

        self.show_question(next_index)?;
        Ok(GamePhase::ShowQuestion)
    }

    pub fn current_question(&self) -> &Question {
        &self.quiz.questions[self.current_question_index]
    }

    /// Read-only ShowQuestionData for the CURRENT question, without attempting
    /// the ShowStart/ShowLeaderboard -> ShowQuestion transition. Callers use this
    /// when the engine has ALREADY moved into ShowQuestion for this question
    /// (e.g. via `next_or_finish()`, which performs that transition itself) and
    /// merely need the announcement payload again — re-calling `show_question()`
    /// in that situation would be rejected by its own phase guard.
    pub fn current_show_question_data(&self) -> ShowQuestionData {
        self.build_show_question_data()
    }

    pub fn result_for(&self, client_id: &str) -> Option<&RoundResult> {
        self.last_round_results
            .iter()
            .find(|result| result.client_id == client_id)
    }

    pub fn player_by_client_id(&self, client_id: &str) -> Option<&Player> {
        self.players.iter().find(|p| p.client_id == *client_id)
    }

    fn sorted_leaderboard(&self) -> Vec<Player> {
        let mut ranked = self.players.clone();
        ranked.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
        ranked
    }

    fn build_show_question_data(&self) -> ShowQuestionData {
        let question = self.current_question();
        ShowQuestionData {
            question: question.question.clone(),
            answers: question.answers.clone(),
            display_order: self.current_display_order.clone(),
            media: question.media.clone(),
            cooldown: question.cooldown,
            submitted_by: question.submitted_by.clone(),
        }
    }
}

#[cfg(test)]
mod tests;
