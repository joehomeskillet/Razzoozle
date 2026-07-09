//! Single chokepoint for manager-relevant STATUS emits.
//! Mirrors Node `broadcastStatus` / `sendStatus`: record then emit.
//!
//! CALLER MUST NOT HOLD the game lock — `std::sync::Mutex` is non-reentrant;
//! recording re-locks `game_ref` and would deadlock.

use crate::state::Game;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::GameStatus;
use socketioxide::{extract::SocketRef, SocketIo};
use std::sync::{Arc, Mutex};

/// Room-wide STATUS: record as manager's last status, then emit to the game room.
pub fn broadcast_status(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    status: &GameStatus,
) {
    {
        game_ref
            .lock()
            .unwrap()
            .record_last_manager_status(status);
    }
    io.to(game_id.to_string())
        .emit(constants::game::STATUS, status)
        .ok();
}

/// Manager-socket STATUS: record, then emit to that socket only.
pub fn send_status_to_manager(
    sock: &SocketRef,
    game_ref: &Arc<Mutex<Game>>,
    status: &GameStatus,
) {
    {
        game_ref
            .lock()
            .unwrap()
            .record_last_manager_status(status);
    }
    sock.emit(constants::game::STATUS, status).ok();
}
