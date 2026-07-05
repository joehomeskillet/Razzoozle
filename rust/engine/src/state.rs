//! state.rs — IO-free game phase state machine.

use crate::scoring::{apply_first_correct_bonus, calculate_points, is_correct};
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::{Question, Quizz};
use razzoozle_protocol::status::{
    ScoringMode, ShowLeaderboardData, ShowQuestionData, ShowResultData, ShowStartData,
};
use std::collections::HashMap;

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
        }
    }
}

impl std::error::Error for GameError {}

#[derive(Debug, Clone, PartialEq)]
pub struct Answer {
    pub answer_key: i32,
    pub response_time_ms: i64,
}

#[derive(Debug, Clone)]
pub struct RoundResult {
    pub client_id: String,
    pub correct: bool,
    pub points: i32,
    pub streak: i32,
    pub first_correct: bool,
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
        }
    }

    /// Test helper: advance the internal server clock.
    pub fn set_clock_ms(&mut self, ms: i64) {
        self.clock_ms = ms;
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
            time: 5000,
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
        answer_key: i32,
    ) -> Result<(), GameError> {
        if self.phase != GamePhase::SelectAnswer {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "record_answer",
            });
        }
        if !self.players.iter().any(|p| p.client_id == client_id) {
            return Err(GameError::UnknownPlayer {
                client_id: client_id.to_string(),
            });
        }
        if self.current_answers.contains_key(client_id) {
            return Err(GameError::DuplicateAnswer {
                client_id: client_id.to_string(),
            });
        }

        let response_time_ms = self.clock_ms - self.question_opened_at_ms;
        self.current_answers.insert(
            client_id.to_string(),
            Answer {
                answer_key,
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

        let first_correct_id = self
            .answer_order
            .iter()
            .find(|client_id| {
                self.current_answers
                    .get(*client_id)
                    .is_some_and(|answer| is_correct(&question, answer.answer_key))
            })
            .cloned();

        let mut results = Vec::new();

        for player in &mut self.players {
            let answer = self.current_answers.get(&player.client_id);
            let correct = answer
                .as_ref()
                .is_some_and(|a| is_correct(&question, a.answer_key));
            let base_factor = if correct { 1.0 } else { 0.0 };
            let response_time_ms = answer.map(|a| a.response_time_ms).unwrap_or(0);
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
            });
        }

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
        self.phase = GamePhase::ShowLeaderboard;

        Ok(ShowLeaderboardData {
            old_leaderboard: self.old_leaderboard.clone(),
            leaderboard,
            team_standings: None,
            auto_advance_ms: None,
            round_recap: None,
        })
    }

    pub fn next_question(&mut self) -> Result<GamePhase, GameError> {
        if self.phase != GamePhase::ShowLeaderboard {
            return Err(GameError::InvalidTransition {
                from: self.phase,
                action: "next_question",
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

    pub fn result_for(&self, client_id: &str) -> Option<&RoundResult> {
        self.last_round_results
            .iter()
            .find(|result| result.client_id == client_id)
    }

    pub fn player_by_client_id(&self, client_id: &str) -> Option<&Player> {
        self.players.iter().find(|p| p.client_id == client_id)
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
            display_order: None,
            media: question.media.clone(),
            cooldown: question.cooldown,
            submitted_by: question.submitted_by.clone(),
        }
    }
}

impl RoundResult {
    pub fn to_show_result_data(&self, player: &Player, total_players: i32) -> ShowResultData {
        ShowResultData {
            correct: self.correct,
            message: if self.correct {
                "Correct".to_string()
            } else {
                "Incorrect".to_string()
            },
            points: self.points,
            my_points: player.points,
            rank: 1,
            ahead_of_me: None,
            streak: Some(self.streak),
            streak_bonus: Some(self.correct && self.streak > 1),
            bonus: None,
            first_correct: Some(self.first_correct),
            poll: None,
            achievements: None,
            bonus_points: None,
            player_count: Some(total_players),
            correct_answer: None,
            correct_chunks: None,
            auto_advance_ms: None,
            round_recap: None,
            scoring_mode: Some(ScoringMode::Speed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use razzoozle_protocol::status::ScoringMode;

    fn fixture_quizz() -> Quizz {
        let json = include_str!("../../../spikes/golden-frames/fixture-quiz.json");
        serde_json::from_str(json).expect("fixture quiz")
    }

    fn make_player(client_id: &str, username: &str) -> Player {
        Player {
            id: format!("socket-{client_id}"),
            client_id: client_id.to_string(),
            connected: true,
            username: username.to_string(),
            points: 0,
            streak: 0,
            is_bot: None,
            avatar: None,
            achievements: None,
            team_id: None,
            identifier_hash: None,
        }
    }

    fn advance_round(
        state: &mut GameState,
        p1_key: i32,
        p2_key: i32,
        p1_time_ms: i64,
        p2_time_ms: i64,
    ) {
        state.open_answers().unwrap();
        state.set_clock_ms(p1_time_ms);
        state.record_answer("player1", p1_key).unwrap();
        state.set_clock_ms(p2_time_ms);
        state.record_answer("player2", p2_key).unwrap();
        state.reveal(ScoringMode::Speed).unwrap();
        state.leaderboard_view().unwrap();
    }

    #[test]
    fn full_game_flow_with_fixture_quiz() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(
            quiz,
            vec![make_player("player1", "Alice"), make_player("player2", "Bob")],
        );

        assert_eq!(state.phase, GamePhase::ShowRoom);

        let start = state.start().unwrap();
        assert_eq!(state.phase, GamePhase::ShowStart);
        assert_eq!(start.subject, "Golden Test Quiz");

        let q1 = state.show_question(0).unwrap();
        assert_eq!(state.phase, GamePhase::ShowQuestion);
        assert_eq!(q1.question, "What is 2 + 2?");

        advance_round(&mut state, 1, 0, 100, 200);

        assert_eq!(state.phase, GamePhase::ShowLeaderboard);
        let board = state.sorted_leaderboard();
        assert_eq!(board[0].client_id, "player1");
        assert_eq!(board[1].client_id, "player2");

        let p1_result = state.result_for("player1").unwrap();
        let p2_result = state.result_for("player2").unwrap();
        assert!(p1_result.correct);
        assert!(!p2_result.correct);
        assert!(p1_result.points > p2_result.points);
        assert_eq!(p1_result.streak, 1);
        assert!(p1_result.first_correct);
        assert!(!p2_result.first_correct);

        let phase = state.next_question().unwrap();
        assert_eq!(phase, GamePhase::ShowQuestion);
        assert_eq!(state.current_question_index, 1);
        assert_eq!(state.current_question().question, "What is the capital of France?");

        advance_round(&mut state, 2, 1, 100, 200);

        assert_eq!(state.result_for("player1").unwrap().streak, 2);
        assert_eq!(state.sorted_leaderboard()[0].client_id, "player1");

        let final_phase = state.next_question().unwrap();
        assert_eq!(final_phase, GamePhase::Finished);
        assert_eq!(state.phase, GamePhase::Finished);
    }

    #[test]
    fn illegal_transitions_are_rejected() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![make_player("player1", "Alice")]);

        assert!(matches!(
            state.show_question(0),
            Err(GameError::InvalidTransition { .. })
        ));

        state.start().unwrap();
        assert!(matches!(
            state.reveal(ScoringMode::Speed),
            Err(GameError::InvalidTransition { .. })
        ));
    }

    #[test]
    fn start_requires_at_least_one_player() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![]);
        assert!(matches!(state.start(), Err(GameError::NoPlayers)));
    }

    #[test]
    fn duplicate_answer_is_rejected() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![make_player("player1", "Alice")]);
        state.start().unwrap();
        state.show_question(0).unwrap();
        state.open_answers().unwrap();
        state.record_answer("player1", 1).unwrap();
        assert!(matches!(
            state.record_answer("player1", 0),
            Err(GameError::DuplicateAnswer { .. })
        ));
    }
}