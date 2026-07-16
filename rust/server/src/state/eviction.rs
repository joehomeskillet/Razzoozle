use razzoozle_protocol::player::Player;
use razzoozle_engine::state::GamePhase;
use socketioxide::SocketIo;
use razzoozle_protocol::constants;
use tracing::warn;

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
    ///
    /// #128 — Additionally, games in RUNNING phase with an unresolvable manager
    /// socket are evicted immediately once stale, without waiting for all players
    /// to disconnect. This prevents crashed manager sessions from leaving zombies
    /// (the manager dies mid-game, never sends LEAVE, so empty_grace never triggers).
    /// RESET is emitted to the room before removal so connected players are notified.
    pub fn evict_stale_games(&mut self, io: &SocketIo) {
        let now = get_now_ms();

        // Track abandoned RUNNING games separately so we can emit RESET before removal
        let mut stale_games: Vec<String> = Vec::new();
        let mut abandoned_running_games: Vec<String> = Vec::new(); // game_ids

        for game_ref in self.games_by_id.values() {
            let game = Self::lock_game_recover(game_ref);
            if !game.is_stale(now) {
                continue;
            }

            let manager_alive = game
                .manager_socket_id
                .parse()
                .ok()
                .and_then(|sid| io.get_socket(sid))
                .is_some();

            // #128: Check if this is a RUNNING game with an unresolvable manager.
            // If so, evict immediately — don't wait for has_connected_players to clear.
            let is_running = game.engine.phase != GamePhase::ShowRoom
                && game.engine.phase != GamePhase::Finished;

            if is_running && !manager_alive {
                warn!(
                    "Evicting abandoned RUNNING game: gameId={}, inviteCode={}, phase={:?}, \
                     manager_socket_id={}, last_activity_ms={}, now_ms={}",
                    game.game_id, game.invite_code, game.engine.phase,
                    game.manager_socket_id, game.last_activity_ms, now
                );
                abandoned_running_games.push(game.game_id.clone());
            } else if game.has_connected_players() {
                // Original #85 Guard: skip if players still connected
                continue;
            } else if manager_alive {
                // Original #85 Guard: skip if manager still alive
                continue;
            } else {
                // Stale with no connected players and no manager: normal eviction
                stale_games.push(game.invite_code.clone());
            }
        }

        // Handle normal stale games (no players, no manager, not RUNNING)
        for invite_code in stale_games {
            if let Some(game_ref) = self.games_by_code.remove(&invite_code) {
                let game = Self::lock_game_recover(&game_ref);
                self.games_by_id.remove(&game.game_id);
                for player in &game.players {
                    self.socket_to_game.remove(&player.id);
                }
                crate::socket::metrics::clear_room(&game.game_id);
            }
        }

        // Handle abandoned RUNNING games: emit RESET to room before removal
        // (same pattern as register_end_game, ensuring all registry indices are cleaned)
        for game_id in abandoned_running_games {
            // Emit RESET to notify any still-connected players
            io.to(game_id.clone())
                .emit(constants::game::RESET, "errors:game.managerDisconnected")
                .ok();

            // Remove via canonical path (cleans all indices: games_by_id, games_by_code,
            // socket_to_game for players + manager, metrics, and empty_games)
            self.remove_game(&game_id);
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
