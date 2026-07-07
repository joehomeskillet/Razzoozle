use razzoozle_protocol::player::Player;

use super::{get_now_ms, GameRegistry};

impl GameRegistry {
    /// C4 — Game eviction: remove stale/finished games and clear their player sessions.
    /// Call periodically to prevent memory leaks. Clears player entries to prevent
    /// "resume reconnect" from keeping sessions forever.
    pub fn evict_stale_games(&mut self) {
        let now = get_now_ms();

        let stale_games: Vec<String> = self
            .games_by_id
            .values()
            .filter_map(|game_ref| {
                let game = Self::lock_game_recover(game_ref);
                if game.is_stale(now) {
                    Some(game.invite_code.clone())
                } else {
                    None
                }
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


    pub fn remove_player_by_socket_id(
        &mut self,
        socket_id: &str,
    ) -> Option<(String, String, String, usize)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
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

                let result = (
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_id,
                    game.players.len(),
                );
                drop(game);
                self.socket_to_game.remove(socket_id);
                return Some(result);
            }
        }

        None
    }

    pub fn mark_player_disconnected(
        &mut self,
        socket_id: &str,
    ) -> Option<(String, String, String, usize, bool)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(player_index) = game
                .players
                .iter()
                .position(|player| player.id == socket_id)
            {
                let removed_player_id = game.players[player_index].client_id.clone();

                // Phase-aware keep-on-disconnect:
                // If lobby (ShowRoom), remove; if started, mark disconnected only
                let removed = if game.engine.phase == razzoozle_engine::state::GamePhase::ShowRoom {
                    // Lobby: hard remove
                    game.players.remove(player_index);
                    game.engine.players.retain(|player| player.id != socket_id);
                    game.engine.current_answers.remove(&removed_player_id);
                    game.engine
                        .answer_order
                        .retain(|client_id| client_id != &removed_player_id);
                    true
                } else {
                    // Mid-game: keep slot, just mark disconnected
                    game.players[player_index].connected = false;
                    if let Some(eng_pos) = game.engine.players.iter().position(|p| p.id == socket_id) {
                        game.engine.players[eng_pos].connected = false;
                    }
                    false
                };

                let result = (
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_id,
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
