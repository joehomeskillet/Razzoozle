//! MANAGER.AUTH, LOGOUT, RECONNECT — manager session handlers

use super::super::HandlerCtx;
use crate::db;
use crate::http::RATE_LIMITER;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::collections::HashSet;

const DEFAULT_MANAGER_PASSWORD: &str = "PASSWORD";

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_auth(socket, ctx.clone());
    register_logout(socket, ctx.clone());
    register_reconnect(socket, ctx.clone());
}

fn register_auth(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::AUTH, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<String>(password)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth brute-force throttle (per client ID)
                if RATE_LIMITER.record_auth_failure_and_check_throttle(&ctx.client_id) {
                    socket
                        .emit(constants::manager::ERROR_MESSAGE, "errors:manager.authThrottled")
                        .ok();
                    return;
                }

                let expected_password = match db::get_manager_password(&ctx.db_pool).await {
                    Some(pw) => pw,
                    None => std::env::var("MANAGER_PASSWORD")
                        .unwrap_or_else(|_| DEFAULT_MANAGER_PASSWORD.to_string()),
                };

                if password == expected_password {
                    {
                        let mut registry = ctx.registry.write().await;
                        registry.login_client(ctx.client_id.clone());
                    }

                    let empty_submissions: HashSet<String> = HashSet::new();
                    let payload = razzoozle_protocol::manager::ManagerConfig {
                        quizz: serde_json::json!([]),
                        results: serde_json::json!([]),
                        submissions: serde_json::json!(empty_submissions),
                        media: Some(serde_json::json!([])),
                        theme_templates: Some(serde_json::json!([])),
                        team_mode: Some(false),
                        low_latency_enabled: Some(false),
                        join_locked: Some(false),
                        randomize_answers: Some(false),
                        scoring_mode: None,
                        achievements: Some(serde_json::json!([])),
                        dev_mode: Some(false),
                        dev_api_key: None,
                        plugins: Some(Vec::new()),
                        observability: None,
                    };

                    socket.emit(constants::manager::CONFIG, &payload).ok();
                } else {
                    socket
                        .emit(constants::manager::ERROR_MESSAGE, "errors:manager.invalidPassword")
                        .ok();
                }
            });
        }
    });
}

fn register_logout(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::LOGOUT, {
        let ctx = ctx.clone();

        move |_socket: SocketRef, _data: Data::<serde_json::Value>| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let mut registry = ctx.registry.write().await;
                registry.logout_client(&ctx.client_id);
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
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                    return;
                }

                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                if let Some(game_id) = game_id_opt {
                    let game_id = game_id.to_string();

                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !crate::is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let mut game = game_ref.lock().unwrap();

                        // Update manager socket
                        game.manager_socket_id = socket.id.to_string();

                        let game_id = game.game_id.clone();
                        let players = game.players.clone();

                        drop(game);

                        // Join the room
                        socket.join(game_id.clone());

                        // Emit reconnect success with game state
                        socket.emit(constants::manager::SUCCESS_RECONNECT, &serde_json::json!({
                            "gameId": game_id,
                            "status": "reconnected",
                            "players": players,
                        })).ok();

                        // Broadcast to room that manager reconnected
                        ctx.io.to(game_id)
                            .emit(constants::manager::PLAYER_RECONNECTED, &serde_json::json!({}))
                            .ok();
                    } else {
                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.notFound").ok();
                    }
                }
            });
        }
    });
}
