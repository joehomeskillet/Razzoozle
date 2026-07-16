use razzoozle_protocol::player::Player;
use socketioxide::SocketIo;

use super::{get_now_ms, GameRegistry};

impl GameRegistry {
    /// C4 — Game eviction: remove stale/finished games and clear their player sessions.
    /// Call periodically to prevent memory leaks. Clears player entries to prevent
    /// "resume reconnect" from keeping sessions forever.
    ///
    /// #85 — the staleness touch heuristic (last_activity_ms) never moves while
    /// a connected lobby player just sits there (no join/answer/reveal event),
    /// so is_stale alone can misfire on a perfectly live game. Abandoned means
    /// stale AND nobody connected: skip a stale game if any player is still
    /// connected, or if the manager's socket is still alive (they just haven't
    /// started yet). Connectivity is only checked once is_stale is already
    /// true, keeping the common (not-stale) path cheap. Manager-less games are
    /// the empty-grace reaper's job, handled separately (cleanup_empty_games).
    pub fn evict_stale_games(&mut self, io: &SocketIo) {
        let now = get_now_ms();

        let stale_games: Vec<String> = self
            .games_by_id
            .values()
            .filter_map(|game_ref| {
                let game = Self::lock_game_recover(game_ref);
                if !game.is_stale(now) {
                    return None;
                }
                if game.has_connected_players() {
                    return None;
                }
                let manager_alive = game
                    .manager_socket_id
                    .parse()
                    .ok()
                    .and_then(|sid| io.get_socket(sid))
                    .is_some();
                if manager_alive {
                    return None;
                }
                Some(game.invite_code.clone())
            })
            .collect();

        for invite_code in stale_games {
            // Remove by invite code (which removes from games_by_code)
            if let Some(game_ref) = self.games_by_code.remove(&invite_code) {
                let game = Self::lock_game_recover(&game_ref);
                // Remove from games_by_id as well
                self.games_by_id.remove(&game.game_id);
                // Drop this evicted game's players from the socket_id index —
                // otherwise those entries would linger forever pointing at a
                // game_id that no longer exists.
                for player in &game.players {
                    self.socket_to_game.remove(&player.id);
                }
                // Drop the evicted game's metrics ring as well
                crate::socket::metrics::clear_room(&game.game_id);
            }
        }
    }
    /// Remove a game from the registry by game_id. Returns true if the game was found and removed,
    /// false otherwise (silent no-op pattern per Node parity).
    pub fn remove_game(&mut self, game_id: &str) -> bool {
        self.empty_games.retain(|e| e.game_id != game_id);

        // Try to find the game by id and remove it
        if let Some(game_ref) = self.games_by_id.remove(game_id) {
            let game = Self::lock_game_recover(&game_ref);
            // Also remove from games_by_code lookup
            self.games_by_code.remove(&game.invite_code);
            // Remove all players from the socket_to_game index
            for player in &game.players {
                self.socket_to_game.remove(&player.id);
            }
            // Also remove the manager socket (defensive; may not be indexed)
            self.socket_to_game.remove(&game.manager_socket_id);
            // Drop the dead game's metrics ring (~5KB/game leak otherwise)
            crate::socket::metrics::clear_room(game_id);
            return true;
        }
        false
    }


    /// `lobby_hard_remove`: caller-controlled override for the ShowRoom
    /// branch. Transport disconnects (#83) pass false — a flaky connection
    /// must keep the roster slot in the lobby too, not just mid-game.
    /// Intentional player:leave still passes true (Node parity: lobby leave
    /// = removePlayer). Non-ShowRoom phases always keep the slot regardless.
    ///
    /// Third tuple element is the player's SOCKET id (not client_id) — the
    /// manager roster (#84) keys players by socket id, and REMOVE_PLAYER
    /// must carry the same id the roster was built with.
    pub fn mark_player_disconnected(
        &mut self,
        socket_id: &str,
        lobby_hard_remove: bool,
    ) -> Option<(String, String, String, usize, bool)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(player_index) = game
                .players
                .iter()
                .position(|player| player.id == socket_id)
            {
                let removed_player_socket_id = game.players[player_index].id.clone();
                let client_id = game.players[player_index].client_id.clone();

                let removed = if game.engine.phase == razzoozle_engine::state::GamePhase::ShowRoom
                    && lobby_hard_remove
                {
                    game.players.remove(player_index);
                    game.engine.players.retain(|player| player.id != socket_id);
                    game.engine.current_answers.remove(&client_id);
                    game.engine
                        .answer_order
                        .retain(|cid| cid != &client_id);
                    true
                } else {
                    // Keep slot: mid-game, or lobby transport-disconnect grace (#83).
                    game.players[player_index].connected = false;
                    if let Some(eng_pos) = game.engine.players.iter().position(|p| p.id == socket_id) {
                        game.engine.players[eng_pos].connected = false;
                    }
                    false
                };

                let result = (
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_socket_id,
                    game.players.len(),
                    removed,
                );
                drop(game);
                // Either way this socket_id is dead: hard-removed, or kept as
                // a disconnected slot that will get a BRAND NEW socket_id on
                // reconnect (this one is never looked up again).
                self.socket_to_game.remove(socket_id);
                return Some(result);
            }
        }

        None
    }

    /// Updates the player's team and returns their updated snapshot plus the
    /// game_id/manager_socket_id a caller needs to broadcast MANAGER.NEW_PLAYER
    /// / PLAYER.UPDATE_LEADERBOARD (the Game is locked here anyway, so reading
    /// them out costs nothing extra). No broadcast happens here.
    pub fn set_player_team(&self, socket_id: &str, team_id: String) -> Option<(Player, String, String)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].team_id = Some(team_id.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].team_id = Some(team_id);
                }
                return Some((
                    game.players[pos].clone(),
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                ));
            }
        }
        None
    }

    /// Updates the player's avatar and returns their updated snapshot plus the
    /// game_id/manager_socket_id (see set_player_team above). No broadcast
    /// happens here.
    pub fn set_player_avatar(&self, socket_id: &str, avatar: String) -> Option<(Player, String, String)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].avatar = Some(avatar.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].avatar = Some(avatar);
                }
                return Some((
                    game.players[pos].clone(),
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                ));
            }
        }
        None
    }
}
