//! state.rs — In-memory game registry and state management.

use razzoozle_engine::state::{GameState, GamePhase};
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizFixture {
    pub subject: String,
    pub questions: Vec<serde_json::Value>,
}

impl QuizFixture {
    /// Load fixture quiz (embedded at compile time so the server runs from any
    /// cwd — a runtime relative path panicked unless launched from rust/server/).
    pub fn load() -> Result<Quizz, Box<dyn std::error::Error>> {
        let contents = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/fixture-quiz.json"));
        let quiz: Quizz = serde_json::from_str(contents)?;
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

/// Registry managing all active games and available quizzes.
pub struct GameRegistry {
    games_by_code: HashMap<String, Arc<Mutex<Game>>>,
    games_by_id: HashMap<String, Arc<Mutex<Game>>>,
    quizzes: HashMap<String, Quizz>,
    default_quiz: Quizz,
    logged_clients: HashSet<String>,
}

impl GameRegistry {
    /// Load all quizzes from the config/quizz directory or fall back to the fixture.
    fn load_quizzes() -> HashMap<String, Quizz> {
        let mut quizzes = HashMap::new();

        // Try to load from config/quizz directory
        let config_path = Self::get_config_path();
        if Path::new(&config_path).exists() {
            if let Ok(entries) = fs::read_dir(&config_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "json").unwrap_or(false) {
                        if let Ok(contents) = fs::read_to_string(&path) {
                            if let Ok(quiz) = serde_json::from_str::<Quizz>(&contents) {
                                if let Some(filename) = path.file_stem() {
                                    let id = filename.to_string_lossy().to_string();
                                    quizzes.insert(id, quiz);
                                }
                            }
                        }
                    }
                }
            }
        }

        quizzes
    }

    /// Get the config path (resolves to config/quizz directory).
    fn get_config_path() -> String {
        if let Ok(config_path) = std::env::var("CONFIG_PATH") {
            format!("{}/quizz", config_path)
        } else {
            // Fallback: assume running from rust/server, config is at ../../config
            let cwd = std::env::current_dir().unwrap();
            cwd.parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("config/quizz").to_string_lossy().to_string())
                .unwrap_or_else(|| "config/quizz".to_string())
        }
    }

    pub fn new(quiz_fixture: Quizz) -> Self {
        let quizzes = Self::load_quizzes();
        Self {
            games_by_code: HashMap::new(),
            games_by_id: HashMap::new(),
            quizzes,
            default_quiz: quiz_fixture,
            logged_clients: HashSet::new(),
        }
    }

    pub fn is_logged(&self, client_id: &str) -> bool {
        self.logged_clients.contains(client_id)
    }

    pub fn login_client(&mut self, client_id: String) {
        self.logged_clients.insert(client_id);
    }

    pub fn logout_client(&mut self, client_id: &str) {
        self.logged_clients.remove(client_id);
    }

    /// Generate a 6-digit PIN code for the invite (matching Node.js validation).
    fn generate_invite_code() -> String {
        let mut rng = rand::thread_rng();
        let pin: u32 = rand::Rng::gen_range(&mut rng, 100000..1000000);
        pin.to_string()
    }

    /// Create a new game with the specified quiz ID, or use default if not found.
    pub fn create_game(&mut self, manager_socket_id: String, quiz_id: Option<String>) -> (String, String) {
        let game_id = Uuid::new_v4().to_string();
        let invite_code = Self::generate_invite_code();

        let quiz = if let Some(id) = quiz_id {
            self.quizzes.get(&id).cloned().unwrap_or_else(|| self.default_quiz.clone())
        } else {
            self.default_quiz.clone()
        };

        let game = Arc::new(Mutex::new(Game::new(
            game_id.clone(),
            invite_code.clone(),
            manager_socket_id,
            quiz,
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

    /// Get a quiz by ID.
    pub fn get_quiz_by_id(&self, quiz_id: &str) -> Option<Quizz> {
        self.quizzes.get(quiz_id).cloned()
    }

    /// List all available quiz IDs.
    pub fn list_quiz_ids(&self) -> Vec<String> {
        self.quizzes.keys().cloned().collect()
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

    pub fn remove_player_by_socket_id(
        &mut self,
        socket_id: &str,
    ) -> Option<(String, String, String, usize)> {
        for game_ref in self.games_by_id.values() {
            let mut game = game_ref.lock().unwrap();

            if let Some(player_index) = game
                .players
                .iter()
                .position(|player| player.id == socket_id)
            {
                let removed_player_id = game.players[player_index].client_id.clone();
                game.players.remove(player_index);
                game.engine.players.retain(|player| player.id != socket_id);
                game.engine.current_answers.remove(&removed_player_id);
                game.engine
                    .answer_order
                    .retain(|client_id| client_id != &removed_player_id);

                return Some((
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_id,
                    game.players.len(),
                ));
            }
        }

        None
    }

    pub fn set_player_team(&self, socket_id: &str, team_id: String) {
        for game_ref in self.games_by_id.values() {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].team_id = Some(team_id.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].team_id = Some(team_id);
                }
                return;
            }
        }
    }

    pub fn set_player_avatar(&self, socket_id: &str, avatar: String) {
        for game_ref in self.games_by_id.values() {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].avatar = Some(avatar.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].avatar = Some(avatar);
                }
                return;
            }
        }
    }
}
