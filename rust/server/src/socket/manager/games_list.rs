//! MANAGER.LIST_GAMES -> MANAGER.GAMES_DATA — admin panel to list running games
//! Lists currently running games with summary info (id, pin, quiz subject, player count, phase, etc.)

use super::super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::SocketRef;
use serde_json::json;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list_games(socket, ctx);
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
                                // TODO(parity): createdAt should use the actual game creation timestamp.
                                // The Game struct does not track a separate created_at field, so we
                                // use last_activity_ms as a best-effort approximation. This diverges from
                                // the actual creation time as the game progresses. Add a created_at field
                                // to the Game struct in state.rs to fix this.
                                "createdAt": game.last_activity_ms,
                            })
                        })
                        .collect::<Vec<_>>()
                };

                socket.emit(constants::manager::GAMES_DATA, &summaries).ok();
            });
        }
    });
}
