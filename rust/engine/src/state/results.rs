use razzoozle_protocol::player::Player;
use razzoozle_protocol::status::{ScoringMode, ShowResultData};

#[derive(Debug, Clone)]
pub struct RoundResult {
    pub client_id: String,
    pub correct: bool,
    pub points: i32,
    pub streak: i32,
    pub first_correct: bool,
}

impl RoundResult {
    pub fn to_show_result_data(&self, player: &Player, total_players: i32) -> ShowResultData {
        ShowResultData {
            correct: self.correct,
            message: String::new(), // Will be set by reveal_helpers
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
            scoring_mode: None,
        }
    }
}
