//! Player event handlers: JOIN, LOGIN, SELECTED_ANSWER, LEAVE, SELECT_TEAM, SET_AVATAR, RECONNECT
use super::lifecycle;
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::SocketRef;

mod answer;
mod login;
mod session;

use answer::register_selected_answer;
use login::{register_join, register_login};
use session::{register_leave, register_reconnect, register_select_team, register_set_avatar};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_join(socket, ctx.clone());
    register_login(socket, ctx.clone());
    register_selected_answer(socket, ctx.clone());
    register_leave(socket, ctx.clone());
    register_select_team(socket, ctx.clone());
    register_set_avatar(socket, ctx.clone());
    register_reconnect(socket, ctx);
}

/// Broadcast a player's team/avatar change: MANAGER.NEW_PLAYER (just the
/// changed player) to the manager socket, and PLAYER.UPDATE_LEADERBOARD (the
/// full roster) to the room. Mirrors Node's PlayerManager.broadcastPlayerUpdate
/// (called from game/index.ts setAvatar/selectTeam, game/index.ts:463-488).
/// Node additionally throttles the leaderboard emit (150ms coalescing via
/// ScoreboardThrottle) — not replicated here, since that's a perf optimization
/// rather than a functional parity gap.
pub(super) fn broadcast_player_update(
    registry: &crate::state::GameRegistry,
    io_handle: &socketioxide::SocketIo,
    game_id: &str,
    manager_socket_id: &str,
    player: razzoozle_protocol::player::Player,
) {
    if let Ok(sid) = manager_socket_id.parse() {
        if let Some(mgr) = io_handle.get_socket(sid) {
            mgr.emit(constants::manager::NEW_PLAYER, &player).ok();
        }
    }

    if let Some(game_ref) = registry.get_game_by_id(game_id) {
        let leaderboard = game_ref.lock().unwrap().players.clone();
        io_handle
            .to(game_id.to_string())
            .emit(
                constants::player::UPDATE_LEADERBOARD,
                &razzoozle_protocol::player::PlayerUpdateLeaderboard { leaderboard },
            )
            .ok();
    }
}
