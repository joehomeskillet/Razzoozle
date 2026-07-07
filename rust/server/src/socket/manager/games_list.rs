//! MANAGER.LIST_GAMES -> MANAGER.GAMES_DATA — admin panel to list running games
//! Lists currently running games with summary info (id, pin, quiz subject, player count, phase, etc.)

use super::super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use serde_json::json;

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
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

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
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                // Ownership: game.manager_client_id must match ctx.client_id
                let owns_game = {
                    let registry = ctx.registry.read().await;
                    if let Some(game_ref) = registry.get_game_by_id(&game_id) {
                        let game = game_ref.lock().unwrap();
                        game.manager_client_id.as_deref() == Some(&ctx.client_id)
                    } else {
                        false
                    }
                };

                if !owns_game {
                    return; // Foreign/unknown gameId: silent no-op
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

                // No is_logged gate (unlike END_GAME) — Node parity
                // Ownership: game.manager_client_id must match ctx.client_id
                let (owns_game, is_started) = {
                    let registry = ctx.registry.read().await;
                    if let Some(game_ref) = registry.get_game_by_id(&game_id) {
                        let game = game_ref.lock().unwrap();
                        let owns = game.manager_client_id.as_deref() == Some(&ctx.client_id);
                        let started = game.engine.phase != razzoozle_engine::state::GamePhase::ShowRoom;
                        (owns, started)
                    } else {
                        (false, false)
                    }
                };

                if !owns_game {
                    return; // Foreign/unknown gameId: silent no-op
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

                // If game is started: NO-OP (grace window handled by separate reconnect machinery)
                // parity gap: Node keeps empty-grace + reconnect window (registry empty-games machinery)
                // Rust equivalent lands with pause/resume wave
            });
        }
    });
}
