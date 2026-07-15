//! MANAGER.LIST_GAMES -> MANAGER.GAMES_DATA — admin panel to list running games
//! Lists currently running games with summary info (id, pin, quiz subject, player count, phase, etc.)

use super::super::HandlerCtx;
use crate::is_game_host;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use serde_json::json;
use tracing::warn;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list_games(socket, ctx.clone());
    register_end_game(socket, ctx.clone());
    register_leave(socket, ctx);
}

fn register_list_games(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::LIST_GAMES, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                // Read the registry and build a list of game summaries
                let summaries = {
                    let registry = ctx.registry.read().await;
                    registry
                        .get_all_games()
                        .iter()
                        .map(|game_ref| {
                            let game = game_ref.lock().unwrap();

                            // Check if the manager socket is actually connected (mirrors Node's
                            // this._manager.connected check). Socket liveness is determined via
                            // the socket.io registry: if the manager_socket_id still resolves
                            // to a live socket, the manager is connected.
                            let manager_connected = {
                                if let Ok(sid) = game.manager_socket_id.parse() {
                                    ctx.io.get_socket(sid).is_some()
                                } else {
                                    false
                                }
                            };

                            json!({
                                "gameId": game.game_id,
                                "inviteCode": game.invite_code,
                                "subject": game.engine.quiz.subject,
                                "playerCount": game.players.len(),
                                "started": game.engine.phase != razzoozle_engine::state::GamePhase::ShowRoom,
                                "managerConnected": manager_connected,
                                "createdAt": game.created_at_ms,
                            })
                        })
                        .collect::<Vec<_>>()
                };

                socket.emit(constants::manager::GAMES_DATA, &summaries).ok();
            });
        }
    });
}

fn register_end_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::END_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let game_id = match payload.get("gameId").and_then(|v| v.as_str()) {
                    Some(id) => id.to_string(),
                    None => return,
                };

                // Auth-gate
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                // Ownership: require is_game_host check (W0-A3 with admin bypass + legacy fallback)
                let owns_game = {
                    let registry = ctx.registry.read().await;
                    if let Some(game_ref) = registry.get_game_by_id(&game_id) {
                        let game = game_ref.lock().unwrap();
                        is_game_host(&game, &payload, &ctx.client_id, Some(&user))
                    } else {
                        false
                    }
                };

                if !owns_game {
                    warn!("END_GAME denied: not game host (game={}, client_id={})", game_id, ctx.client_id);
                    return;
                }

                // Emit RESET to the room, then remove the game
                ctx.io
                    .to(game_id.clone())
                    .emit(constants::game::RESET, "errors:game.managerDisconnected")
                    .ok();

                {
                    let mut registry = ctx.registry.write().await;
                    registry.remove_game(&game_id);
                }
            });
        }
    });
}

fn register_leave(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::LEAVE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let game_id = match payload.get("gameId").and_then(|v| v.as_str()) {
                    Some(id) => id.to_string(),
                    None => return,
                };

                // Auth-gate: must be authenticated to leave a game
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        warn!("LEAVE denied: not authenticated (game={})", game_id);
                        return;
                    }
                };

                // Ownership: require is_game_host check (W0-A3 with admin bypass + legacy fallback)
                let (owns_game, is_started) = {
                    let registry = ctx.registry.read().await;
                    if let Some(game_ref) = registry.get_game_by_id(&game_id) {
                        let game = game_ref.lock().unwrap();
                        let owns = is_game_host(&game, &payload, &ctx.client_id, Some(&user));
                        let started = game.engine.phase != razzoozle_engine::state::GamePhase::ShowRoom;
                        (owns, started)
                    } else {
                        (false, false)
                    }
                };

                if !owns_game {
                    warn!("LEAVE denied: not game host (game={}, client_id={})", game_id, ctx.client_id);
                    return;
                }

                // If game NOT started: tear down immediately (intentional leave on lobby)
                if !is_started {
                    ctx.io
                        .to(game_id.clone())
                        .emit(constants::game::RESET, "errors:game.managerDisconnected")
                        .ok();

                    {
                        let mut registry = ctx.registry.write().await;
                        registry.remove_game(&game_id);
                    }
                    return;
                }

                // Started game: park in empty-grace; cleanup reaper RESET+removes after 5 min
                {
                    let mut registry = ctx.registry.write().await;
                    registry.mark_game_as_empty(game_id);
                }
            });
        }
    });
}
