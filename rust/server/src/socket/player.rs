//! Player event handlers: JOIN, LOGIN, SELECTED_ANSWER, LEAVE, SELECT_TEAM, SET_AVATAR, RECONNECT
use super::HandlerCtx;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::{
    GameStatus, WaitData,
};
use serde_json;
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::info;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_join(socket, ctx.clone());
    register_login(socket, ctx.clone());
    register_selected_answer(socket, ctx.clone());
    register_leave(socket, ctx.clone());
    register_select_team(socket, ctx.clone());
    register_set_avatar(socket, ctx.clone());
    register_reconnect(socket, ctx);
}

fn register_join(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::JOIN, {
        let registry = ctx.registry.clone();

        move |socket: SocketRef, Data::<String>(invite_code)| {
            let registry = registry.clone();

            tokio::spawn(async move {
                let registry = registry.read().await;
                let game_opt = registry.get_game_by_code(&invite_code);

                match game_opt {
                    Some(game) => {
                        let game_data = game.lock().unwrap();
                        let payload = razzoozle_protocol::game::GameSuccessRoom {
                            game_id: game_data.game_id.clone(),
                            require_identifier: None,
                        };
                        drop(game_data);

                        info!("Player checking game: invite_code={}", invite_code);

                        socket.emit(constants::game::SUCCESS_ROOM, &payload).ok();
                    }
                    None => {
                        info!("Game not found: invite_code={}", invite_code);
                        socket
                            .emit(constants::game::ERROR_MESSAGE, "errors:game.notFound")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_login(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::LOGIN, {
        let registry = ctx.registry.clone();
        let socket_id = socket.id.to_string();
        let client_id = ctx.client_id.clone();
        let io_handle = ctx.io.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = registry.clone();
            let socket_id = socket_id.clone();
            let client_id = client_id.clone();
            let io_handle = io_handle.clone();

            tokio::spawn(async move {
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                let username_opt = payload
                    .get("data")
                    .and_then(|v| v.get("username"))
                    .and_then(|v| v.as_str());
                let avatar = payload
                    .get("data")
                    .and_then(|v| v.get("avatar"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                match (game_id_opt, username_opt) {
                    (Some(game_id), Some(username)) => {
                        // H — username/avatar length validation
                        if let Err(e) = crate::state::GameRegistry::validate_username(username) {
                            socket.emit(constants::game::ERROR_MESSAGE, e).ok();
                            return;
                        }

                        if let Some(ref av) = avatar {
                            if let Err(e) = crate::state::GameRegistry::validate_avatar(av) {
                                socket.emit(constants::game::ERROR_MESSAGE, e).ok();
                                return;
                            }
                        }

                        let game_opt = {
                            let registry = registry.read().await;
                            registry.get_game_by_id(game_id)
                        };

                        match game_opt {
                            Some(game_ref) => {
                                let (game_id_ret, manager_socket_id, player, total_players) = {
                                    let mut game = game_ref.lock().unwrap();

                                    // H — per-game player cap
                                    if game.players.len() >= crate::state::MAX_PLAYERS_PER_GAME {
                                        drop(game);
                                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.gameFull").ok();
                                        return;
                                    }

                                    let player = game.add_player(
                                        socket_id.clone(),
                                        client_id.clone(),
                                        username.to_string(),
                                        avatar,
                                    );

                                    let game_id = game.game_id.clone();
                                    let manager_socket_id = game.manager_socket_id.clone();
                                    let total_players = game.players.len();

                                    (game_id, manager_socket_id, player, total_players)
                                };

                                info!(
                                    "Player joined game: gameId={}, username={}",
                                    game_id_ret, username
                                );

                                socket.join(game_id_ret.clone()).ok();

                                socket
                                    .emit(constants::game::SUCCESS_JOIN, &game_id_ret)
                                    .ok();


                                socket.emit("player:token", &serde_json::json!({"playerToken": player.player_token})).ok();
                                if let Ok(sid) = manager_socket_id.parse() {
                                    if let Some(mgr) = io_handle.get_socket(sid) {
                                        mgr.emit(constants::manager::NEW_PLAYER, &player).ok();
                                    }
                                }

                                socket
                                    .to(game_id_ret)
                                    .emit(constants::game::TOTAL_PLAYERS, &(total_players as i32))
                                    .ok();
                            }
                            None => {
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, "errors:game.notFound")
                                    .ok();
                            }
                        }
                    }
                    _ => {
                        socket
                            .emit(constants::game::ERROR_MESSAGE, "errors:game.invalidPayload")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_selected_answer(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::SELECTED_ANSWER, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let client_id = ctx.client_id.clone();

        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = registry.clone();
            let io_handle = io_handle.clone();
            let client_id = client_id.clone();

            tokio::spawn(async move {
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                // Extract all answer fields
                let data_obj = payload.get("data");
                let answer_key_opt = data_obj
                    .and_then(|v| v.get("answerKey"))
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32);

                let answer_keys_opt = data_obj
                    .and_then(|v| v.get("answerKeys"))
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_i64().map(|n| n as i32))
                            .collect::<Vec<i32>>()
                    })
                    .and_then(|v| if v.is_empty() { None } else { Some(v) });

                let answer_text_opt = data_obj
                    .and_then(|v| v.get("answerText"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        let record_result = {
                            let mut game = game_ref.lock().unwrap();
                            // Use the durable clientId from the socket handshake (captured at
                            // connect). The old code matched `p.id == socket.id`, but p.id is a
                            // generated player id that never equals socket.id — so the answer was
                            // stored under the raw socket id and reveal never found it → 0 points
                            // for every player. clientId is the same key reveal looks answers up by.

                            // Get current server time (wall-clock) for response_time_ms calculation
                            let server_now_ms = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .map(|d| d.as_millis() as i64)
                                .unwrap_or(0);

                            // Set engine clock to current wall-clock time so record_answer
                            // calculates response_time_ms correctly
                            game.engine.set_clock_ms(server_now_ms);

                            game.engine.record_answer(
                                &client_id,
                                answer_key_opt,
                                answer_keys_opt,
                                answer_text_opt,
                            ).ok()
                        };

                        if record_result.is_some() {
                            let answer_count = {
                                let game = game_ref.lock().unwrap();
                                game.engine.current_answers.len() as i32
                            };

                            let game_id = game_id.to_string();
                            // Emit game:playerAnswer (count) to all in room
                            io_handle.to(game_id.clone())
                                .emit(constants::game::PLAYER_ANSWER, &answer_count).ok();

                            // Emit WAIT status to all players
                            let wait_status = GameStatus::Wait(WaitData {
                                text: "game:waitingForAnswers".to_string(),
                                team_mode: None,
                            });
                            io_handle.to(game_id)
                                .emit(constants::game::STATUS, &wait_status).ok();
                        }
                    }
                }
            });
        }
    });
}

fn register_leave(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::LEAVE, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let socket_id = socket.id.to_string();

        move |_socket: SocketRef, Data::<serde_json::Value>(_payload)| {
            let registry = registry.clone();
            let io_handle = io_handle.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                let removed_player = {
                    let mut registry = registry.write().await;
                    registry.remove_player_by_socket_id(&socket_id)
                };

                if let Some((game_id, _manager_socket_id, _removed_player_id, total_players)) = removed_player {
                    io_handle.to(game_id).emit(constants::game::TOTAL_PLAYERS, &(total_players as i32)).ok();
                }
            });
        }
    });
}

fn register_select_team(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::SELECT_TEAM, {
        let registry = ctx.registry.clone();
        let socket_id = socket.id.to_string();

        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let team_id_opt = payload.get("teamId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let registry = registry.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                if let Some(team_id) = team_id_opt {
                    let registry = registry.read().await;
                    registry.set_player_team(&socket_id, team_id);
                }
            });
        }
    });
}

fn register_set_avatar(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::SET_AVATAR, {
        let registry = ctx.registry.clone();
        let socket_id = socket.id.to_string();

        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let avatar_opt = payload.get("avatar").and_then(|v| v.as_str()).map(|s| s.to_string());
            let registry = registry.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                if let Some(avatar) = avatar_opt {
                    let registry = registry.read().await;
                    registry.set_player_avatar(&socket_id, avatar);
                }
            });
        }
    });
}

fn register_reconnect(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::RECONNECT, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let socket_id = socket.id.to_string();
        let client_id = ctx.client_id.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = registry.clone();
            let _io_handle = io_handle.clone();
            let socket_id = socket_id.clone();
            let client_id = client_id.clone();

            tokio::spawn(async move {
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                let player_token_opt = payload.get("playerToken").and_then(|v| v.as_str());

                if let Some(game_id) = game_id_opt {
                    let game_id = game_id.to_string();

                    let game_opt = {
                        let registry = registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        let mut game = game_ref.lock().unwrap();

                        // Find player: token-preferred (secure), fall back to handshake clientId (backward-compat)
                        let pos_opt = if let Some(token) = player_token_opt {
                            game.players.iter().position(|p| p.player_token.as_deref() == Some(token))
                        } else {
                            game.players.iter().position(|p| p.client_id == client_id)
                        };

                        if let Some(pos) = pos_opt {
                            let game_id_ret = game.game_id.clone();
                            game.players[pos].id = socket_id.clone();
                            game.players[pos].connected = true;

                            // Update engine players
                            if let Some(engine_pos) = game.engine.players.iter().position(|p| p.client_id == game.players[pos].client_id) {
                                game.engine.players[engine_pos].id = socket_id.clone();
                                game.engine.players[engine_pos].connected = true;
                            }

                            // Read points/streak from engine.players (where scoring happens)
                            let (username, points, streak) = if let Some(engine_pos) = game.engine.players.iter().position(|p| p.client_id == game.players[pos].client_id) {
                                let ep = &game.engine.players[engine_pos];
                                (ep.username.clone(), ep.points, ep.streak)
                            } else {
                                (game.players[pos].username.clone(), game.players[pos].points, game.players[pos].streak)
                            };

                            drop(game);

                            // Join the room
                            socket.join(game_id_ret.clone());

                            // Emit reconnect success with player state
                            socket.emit(constants::player::SUCCESS_RECONNECT, &serde_json::json!({
                                "playerId": socket_id,
                                "username": username,
                                "points": points,
                                "streak": streak,
                            })).ok();
                        } else {
                            socket.emit(constants::game::ERROR_MESSAGE, "errors:game.playerNotFound").ok();
                        }
                    } else {
                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.notFound").ok();
                    }
                }
            });
        }
    });
}
