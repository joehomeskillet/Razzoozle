use crate::types::Game;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use uuid::Uuid;
use rand::Rng;

pub struct GameRegistry {
    // Map invite code -> game
    games_by_code: HashMap<String, Arc<Mutex<Game>>>,
    // Map game ID -> game (for quick lookup by gameId)
    games_by_id: HashMap<String, Arc<Mutex<Game>>>,
}

impl GameRegistry {
    pub fn new() -> Self {
        Self {
            games_by_code: HashMap::new(),
            games_by_id: HashMap::new(),
        }
    }

    /// Generate a 6-digit PIN code for the invite (matching Node.js inviteCodeValidator)
    pub fn generate_invite_code() -> String {
        let mut rng = rand::thread_rng();
        let pin: u32 = rng.gen_range(100000..1000000);
        pin.to_string()
    }

    /// Create a new game and store it in the registry
    pub fn create_game(&mut self, manager_socket_id: String) -> (String, String) {
        let game_id = Uuid::new_v4().to_string();
        let invite_code = Self::generate_invite_code();

        let game = Arc::new(Mutex::new(Game::new(
            game_id.clone(),
            invite_code.clone(),
            manager_socket_id,
        )));

        self.games_by_code.insert(invite_code.clone(), Arc::clone(&game));
        self.games_by_id.insert(game_id.clone(), game);

        (game_id, invite_code)
    }

    /// Find a game by invite code
    pub fn get_game_by_code(&self, invite_code: &str) -> Option<Arc<Mutex<Game>>> {
        self.games_by_code.get(invite_code).cloned()
    }

    /// Find a game by game ID
    pub fn get_game_by_id(&self, game_id: &str) -> Option<Arc<Mutex<Game>>> {
        self.games_by_id.get(game_id).cloned()
    }

    /// Find the manager socket ID for a game
    pub fn get_manager_socket_id(&self, game_id: &str) -> Option<String> {
        self.games_by_id
            .get(game_id)
            .and_then(|game| {
                let g = game.lock().unwrap();
                Some(g.manager_socket_id.clone())
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_invite_code() {
        let code = GameRegistry::generate_invite_code();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn test_create_game() {
        let mut registry = GameRegistry::new();
        let (game_id, invite_code) = registry.create_game("manager_socket_1".to_string());

        assert!(!game_id.is_empty());
        assert_eq!(invite_code.len(), 6);

        let game = registry.get_game_by_code(&invite_code);
        assert!(game.is_some());

        let game = registry.get_game_by_id(&game_id);
        assert!(game.is_some());
    }
}
