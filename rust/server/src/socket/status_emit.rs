//! Single chokepoint for manager-relevant STATUS emits.
//! Mirrors Node `broadcastStatus` / `sendStatus`: record then emit atomically.
//!
//! CALLER MUST NOT HOLD the game lock — the functions themselves will lock and
//! drop before returning. Emit and record happen under the same lock guard so
//! recorded state always matches wire order (Node single-threaded parity).
//! socketioxide 0.15 emits are sync (no .await) and non-blocking (channel try_send),
//! so holding std::sync::Mutex across them is safe.

use crate::state::Game;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::GameStatus;
use socketioxide::{extract::SocketRef, SocketIo};
use std::sync::{Arc, Mutex};

/// Room-wide STATUS: record as manager's last status, then emit to the game room.
/// Record and emit are atomic under the game lock.
pub fn broadcast_status(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    status: &GameStatus,
) {
    let mut game = game_ref.lock().unwrap();
    game.record_last_manager_status(status);
    io.to(game_id.to_string())
        .emit(constants::game::STATUS, status)
        .ok();
}

/// Manager-socket STATUS: record, then emit to that socket only.
/// Record and emit are atomic under the game lock.
pub fn send_status_to_manager(
    sock: &SocketRef,
    game_ref: &Arc<Mutex<Game>>,
    status: &GameStatus,
) {
    let mut game = game_ref.lock().unwrap();
    game.record_last_manager_status(status);
    sock.emit(constants::game::STATUS, status).ok();
}

/// Emit lifecycle events to all registered plugins for a game state transition.
/// Iterates installed_plugins and emits `plugin:<id>:lifecycle:<hook>` event for
/// each plugin to ALL sockets in the game room, with payload {gameId, status, data}.
/// Non-fatal: errors are logged but never break the game round (crash-guarded).
pub fn emit_plugin_lifecycle(
    io: &SocketIo,
    game_id: &str,
    hook_name: &str,
    status_str: &str,
) {
    let plugins = crate::socket::manager::plugins::read_plugins_index();
    
    for plugin in plugins {
        // Check if plugin is enabled and declares this lifecycle hook
        if !plugin.enabled {
            continue;
        }
        
        // Only emit if the plugin declares this hook in its manifest
        // (for now, emit to all — Node emits to all registered plugins regardless)
        let event_name = format!("plugin:{}:lifecycle:{}", plugin.id, hook_name);
        let payload = serde_json::json!({
            "gameId": game_id,
            "status": status_str,
            "data": {}
        });
        
        match io.to(game_id.to_string()).emit(&event_name, &payload) {
            Ok(()) => {},
            Err(e) => {
                tracing::warn!(
                    "failed to emit plugin lifecycle event {} for game {}: {}",
                    event_name, game_id, e
                );
            }
        }
    }
}
