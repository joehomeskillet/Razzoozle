//! LOGOUT, RECONNECT — manager session handlers (DB-session-token auth only)

use super::super::HandlerCtx;
use super::config_helper;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_logout(socket, ctx.clone());
    register_reconnect(socket, ctx.clone());
}

fn register_logout(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::LOGOUT, {
        let ctx = ctx.clone();

        move |_socket: SocketRef, _data: Data::<serde_json::Value>| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate: require valid session
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => return,
                };

                // Logout: nothing to do on server side (session token validity is all that matters).
                // Client clears its token on logout.
            });
        }
    });
}

fn register_reconnect(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RECONNECT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate: manager:reconnect requires valid session
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                let game_id_opt = payload
                    .get("gameId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let Some(game_id) = game_id_opt else {
                    return;
                };

                let game_opt = {
                    let registry = ctx.registry.read().await;
                    registry.get_game_by_id(&game_id)
                };

                let Some(game_ref) = game_opt else {
                    socket
                        .emit(constants::game::RESET, "errors:game.expired")
                        .ok();

                    return;
                };

                // OWNERSHIP gates the reconnect (mirrors Node game.ts:95-116).
                // is_game_host() checks real ownership via game.manager_client_id
                // when no hostToken is sent.
                let is_owner = {
                    let game = game_ref.lock().unwrap();
                    crate::is_game_host(&game, &payload, &ctx.client_id)
                };

                if !is_owner {
                    socket
                        .emit(constants::game::RESET, "errors:game.expired")
                        .ok();

                    return;
                }

                // Ownership verified: refresh manager_client_id to this reconnecting clientId,
                // keeping ownership current across e.g. a cleared-localStorage reconnect.
                {
                    let mut registry = ctx.registry.write().await;
                    registry.reactivate_game(game_id.clone());
                }
                {
                    let mut game = game_ref.lock().unwrap();
                    game.manager_client_id = Some(ctx.client_id.clone());
                }

                let new_socket_id = socket.id.to_string();

                // Reject while a DIFFERENT manager socket is still genuinely
                // connected — mirrors Node's `this._manager.connected` guard
                // (GAME.RESET "errors:game.managerAlreadyConnected").
                let previous_socket_id = {
                    let game = game_ref.lock().unwrap();
                    game.manager_socket_id.clone()
                };

                if previous_socket_id != new_socket_id {
                    if let Ok(sid) = previous_socket_id.parse() {
                        if ctx.io.get_socket(sid).is_some() {
                            socket
                                .emit(
                                    constants::game::RESET,
                                    "errors:game.managerAlreadyConnected",
                                )
                                .ok();

                            return;
                        }
                    }
                }

                let (game_id, players, current_question_index, total_questions, reconnect_status) = {
                    let mut game = game_ref.lock().unwrap();
                    game.manager_socket_id = new_socket_id;
                    let reconnect_status = game.manager_reconnect_status();
                    (
                        game.game_id.clone(),
                        game.players.clone(),
                        game.engine.current_question_index,
                        game.engine.quiz.questions.len(),
                        reconnect_status,
                    )
                };

                socket.join(game_id.clone());

                let (status_name, status_data) = reconnect_status;

                socket
                    .emit(
                        constants::manager::SUCCESS_RECONNECT,
                        &serde_json::json!({
                            "gameId": game_id,
                            "currentQuestion": {
                                "current": current_question_index + 1,
                                "total": total_questions,
                            },
                            "status": { "name": status_name, "data": status_data },
                            "players": players,
                        }),
                    )
                    .ok();
                socket
                    .emit(constants::game::TOTAL_PLAYERS, &(players.len() as i32))
                    .ok();
            });
        }
    });
}
