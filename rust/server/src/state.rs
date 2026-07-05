//! state.rs — In-memory game registry and state management.

use razzoozle_engine::state::{GameState, GamePhase};
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizFixture {
    pub subject: String,
    pub questions: Vec<serde_json::Value>,
}

impl QuizFixture {
    /// Load fixture quiz from JSON file and convert to protocol Quizz type
    pub fn load() -> Result<Quizz, Box<dyn std::error::Error>> {
        let path = "fixture-quiz.json";
        let contents = fs::read_to_string(path)?;
        let quiz: Quizz = serde_json::from_str(&contents)?;
        Ok(quiz)
    }
}

/// In-memory game state, wrapping the engine's GameState.
#[derive(Debug)]
pub struct Game {
    pub game_id: String,
    pub invite_code: String,
    pub manager_socket_id: String,
    pub players: Vec<Player>,
    pub engine: GameState,
}

impl Game {
    pub fn new(
        game_id: String,
        invite_code: String,
        manager_socket_id: String,
        quiz: Quizz,
    ) -> Self {
        Self {
            game_id,
            invite_code,
            manager_socket_id,
            players: Vec::new(),
            engine: GameState::new(quiz, Vec::new()),
        }
    }

    /// Add a player to the game and return their player data.
    pub fn add_player(
        &mut self,
        socket_id: String,
        client_id: String,
        username: String,
        avatar: Option<String>,
    ) -> Player {
        let player = Player {
            id: socket_id,
            client_id: client_id.clone(),
            username,
            connected: true,
            points: 0,
            streak: 0,
            is_bot: None,
            avatar,
            achievements: None,
            team_id: None,
            identifier_hash: None,
        };
        self.players.push(player.clone());
        // Also add to engine's players list
        self.engine.players.push(player.clone());
        player
    }
}

/// Registry managing all active games.
pub struct GameRegistry {
    games_by_code: HashMap<String, Arc<Mutex<Game>>>,
    games_by_id: HashMap<String, Arc<Mutex<Game>>>,
    quiz: Quizz,
}

impl GameRegistry {
    pub fn new(quiz: Quizz) -> Self {
        Self {
            games_by_code: HashMap::new(),
            games_by_id: HashMap::new(),
            quiz,
        }
    }

    /// Generate a 6-digit PIN code for the invite (matching Node.js validation).
    fn generate_invite_code() -> String {
        let mut rng = rand::thread_rng();
        let pin: u32 = rand::Rng::gen_range(&mut rng, 100000..1000000);
        pin.to_string()
    }

    /// Create a new game and return (game_id, invite_code).
    pub fn create_game(&mut self, manager_socket_id: String) -> (String, String) {
        let game_id = Uuid::new_v4().to_string();
        let invite_code = Self::generate_invite_code();

        let game = Arc::new(Mutex::new(Game::new(
            game_id.clone(),
            invite_code.clone(),
            manager_socket_id,
            self.quiz.clone(),
        )));

        self.games_by_code.insert(invite_code.clone(), Arc::clone(&game));
        self.games_by_id.insert(game_id.clone(), game);

        (game_id, invite_code)
    }

    /// Find a game by invite code.
    pub fn get_game_by_code(&self, invite_code: &str) -> Option<Arc<Mutex<Game>>> {
        self.games_by_code.get(invite_code).cloned()
    }

    /// Find a game by game ID.
    pub fn get_game_by_id(&self, game_id: &str) -> Option<Arc<Mutex<Game>>> {
        self.games_by_id.get(game_id).cloned()
    }

    /// Find the manager socket ID for a game.
    pub fn get_manager_socket_id(&self, game_id: &str) -> Option<String> {
        self.games_by_id
            .get(game_id)
            .and_then(|game| {
                let g = game.lock().unwrap();
                Some(g.manager_socket_id.clone())
            })
    }
}
