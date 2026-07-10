use razzoozle_protocol::player::Player;
use razzoozle_protocol::status::ShowResultData;

#[derive(Debug, Clone)]
pub struct RoundResult {
    pub client_id: String,
    pub correct: bool,
    pub points: i32,
    pub streak: i32,
    pub first_correct: bool,
    pub response_time_ms: i64,
    pub answered: bool,
    pub achievements: Vec<String>,
    pub bonus_points: i32,
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
            achievements: (!self.achievements.is_empty()).then(|| self.achievements.clone()),
            bonus_points: (self.bonus_points > 0).then_some(self.bonus_points),
            player_count: Some(total_players),
            correct_answer: None,
            correct_chunks: None,
            auto_advance_ms: None,
            round_recap: None,
            scoring_mode: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_player(client_id: &str, username: &str) -> Player {
        Player {
            id: format!("socket-{client_id}"),
            client_id: client_id.to_string(),
            connected: true,
            username: username.to_string(),
            points: 100,
            streak: 0,
            player_token: None,
            is_bot: None,
            avatar: None,
            achievements: None,
            team_id: None,
            identifier_hash: None,
        }
    }

    #[test]
    fn to_show_result_data_initializes_auto_advance_ms_as_none() {
        let player = make_player("player1", "Alice");
        let result = RoundResult {
            client_id: "player1".to_string(),
            correct: true,
            points: 50,
            streak: 1,
            first_correct: true,
            response_time_ms: 1000,
            answered: true,
            achievements: vec![],
            bonus_points: 0,
        };

        let data = result.to_show_result_data(&player, 2);
        
        // Verify auto_advance_ms is None in the base method
        // (it will be set in reveal_helpers if auto_mode is active)
        assert_eq!(data.auto_advance_ms, None);
        
        // Verify other fields are set correctly
        assert!(data.correct);
        assert_eq!(data.points, 50);
        assert_eq!(data.streak, Some(1));
        assert_eq!(data.player_count, Some(2));
        assert_eq!(data.first_correct, Some(true));
    }
}
