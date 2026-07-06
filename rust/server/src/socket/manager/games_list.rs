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
                            json!({
                                "gameId": game.game_id,
                                "inviteCode": game.invite_code,
                                "subject": game.engine.quiz.subject,
                                "playerCount": game.players.len(),
                                "started": game.engine.phase != razzoozle_engine::state::GamePhase::ShowRoom,
                                "managerConnected": true,
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
