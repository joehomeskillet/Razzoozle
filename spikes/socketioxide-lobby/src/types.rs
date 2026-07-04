use serde::{Deserialize, Serialize};

// Event names matching the Node.js constants
pub mod events {
    pub const GAME_CREATE: &str = "game:create";
    pub const GAME_SUCCESS_ROOM: &str = "game:successRoom";
    pub const GAME_SUCCESS_JOIN: &str = "game:successJoin";
    pub const GAME_TOTAL_PLAYERS: &str = "game:totalPlayers";
    pub const GAME_ERROR_MESSAGE: &str = "game:errorMessage";
    pub const MANAGER_GAME_CREATED: &str = "manager:gameCreated";
    pub const MANAGER_NEW_PLAYER: &str = "manager:newPlayer";
    pub const PLAYER_JOIN: &str = "player:join";
    pub const PLAYER_LOGIN: &str = "player:login";
}

// Event payloads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameCreatedPayload {
    pub gameId: String,
    pub inviteCode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuccessRoomPayload {
    pub gameId: String,
    #[serde(default)]
    pub requireIdentifier: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerLoginData {
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerLoginPayload {
    pub gameId: String,
    pub data: PlayerLoginData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: String,
    pub clientId: String,
    pub username: String,
    pub connected: bool,
    pub points: u32,
    pub streak: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub gameId: String,
    pub inviteCode: String,
    pub manager_socket_id: String,
    pub players: Vec<Player>,
}

impl Game {
    pub fn new(gameId: String, inviteCode: String, manager_socket_id: String) -> Self {
        Self {
            gameId,
            inviteCode,
            manager_socket_id,
            players: Vec::new(),
        }
    }

    pub fn add_player(
        &mut self,
        socket_id: String,
        client_id: String,
        username: String,
        avatar: Option<String>,
    ) -> Player {
        let player = Player {
            id: socket_id,
            clientId: client_id,
            username,
            connected: true,
            points: 0,
            streak: 0,
            avatar,
        };
        self.players.push(player.clone());
        player
    }
}
