use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use socketioxide::SocketIo;

use super::registry::EmptyGame;
use super::{get_now_ms, GameRegistry};

const EMPTY_GAME_GRACE_MS: u64 = 300_000; // 5 min — started/in-progress games
const EMPTY_LOBBY_GRACE_MS: u64 = 60_000; // 1 min — host-less lobby

impl GameRegistry {
    /// Park a game in the empty-grace list (idempotent per game_id).
    pub fn mark_game_as_empty(&mut self, game_id: String) {
        if self.empty_games.iter().any(|e| e.game_id == game_id) {
            return;
        }
        self.empty_games.push(EmptyGame {
            game_id,
            marked_at_ms: get_now_ms(),
        });
    }

    /// Pull a game out of the empty-grace window on manager reconnect (idempotent).
    pub fn reactivate_game(&mut self, game_id: String) {
        self.empty_games.retain(|e| e.game_id != game_id);
    }

    /// Periodic cleanup: RESET + remove games that stayed empty past their grace window.
    pub fn cleanup_empty_games(&mut self, io: &SocketIo) {
        let now = get_now_ms();

        let mut to_reset_and_remove: Vec<String> = Vec::new();
        let mut orphans: Vec<String> = Vec::new();

        for empty in &self.empty_games {
            let Some(game_ref) = self.games_by_id.get(&empty.game_id) else {
                orphans.push(empty.game_id.clone());
                continue;
            };
            let game = Self::lock_game_recover(game_ref);
            let started = game.engine.phase != GamePhase::ShowRoom;
            let grace_ms = if started {
                EMPTY_GAME_GRACE_MS
            } else {
                EMPTY_LOBBY_GRACE_MS
            };
            if now.saturating_sub(empty.marked_at_ms) > grace_ms {
                to_reset_and_remove.push(empty.game_id.clone());
            }
        }

        let drop_ids: std::collections::HashSet<String> = to_reset_and_remove
            .iter()
            .chain(orphans.iter())
            .cloned()
            .collect();
        self.empty_games
            .retain(|e| !drop_ids.contains(&e.game_id));

        for game_id in to_reset_and_remove {
            io.to(game_id.clone())
                .emit(constants::game::RESET, "errors:game.managerDisconnected")
                .ok();
            self.remove_game(&game_id);
        }
    }
}