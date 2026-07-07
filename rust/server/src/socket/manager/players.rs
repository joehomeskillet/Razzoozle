//! MANAGER.KICK_PLAYER, ADD_BOTS — player management handlers

use super::super::HandlerCtx;
use crate::is_game_host;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_kick_player(socket, ctx.clone());
    register_add_bots(socket, ctx.clone());
}

fn register_kick_player(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::KICK_PLAYER, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let player_id_opt = payload.get("playerId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let ctx = ctx.clone();

            tokio::spawn(async move {
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

                if let (Some(game_id), Some(player_id)) = (game_id_opt, player_id_opt) {
                    let removed_count = {
                        let registry = ctx.registry.read().await;
                        let game_opt = registry.get_game_by_id(&game_id);
                        if let Some(game_ref) = game_opt {
                            {
                                let game = game_ref.lock().unwrap();
                                if !is_game_host(&game, &payload, &ctx.client_id) {
                                    socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                    return;
                                }
                            }

                            let mut game = game_ref.lock().unwrap();
                            if let Some(pos) = game.players.iter().position(|p| p.client_id == player_id) {
                                game.players.remove(pos);
                                game.engine.players.retain(|p| p.client_id != player_id);
                                game.engine.current_answers.remove(&player_id);
                                game.engine.answer_order.retain(|c| c != &player_id);
                                Some(game.players.len())
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    };

                    if let Some(total) = removed_count {
                        ctx.io.to(game_id.clone()).emit(constants::game::TOTAL_PLAYERS, &(total as i32)).ok();
                        ctx.io.to(game_id).emit(constants::manager::REMOVE_PLAYER, &player_id).ok();
                    }
                }
            });
        }
    });
}

fn register_add_bots(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::ADD_BOTS, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Check auth
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                    return;
                }

                // Extract gameId and count
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                let count_opt = payload.get("count").and_then(|v| v.as_i64()).map(|v| v as i32);

                if let (Some(game_id), Some(count)) = (game_id_opt, count_opt) {
                    let game_id = game_id.to_string();

                    // Check SIM_MODE
                    if std::env::var("RAHOOT_SIM_MODE").as_deref() != Ok("1") {
                        socket.emit(
                            constants::manager::ERROR_MESSAGE,
                            "errors:manager.simModeDisabled"
                        ).ok();
                        return;
                    }

                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload, &ctx.client_id) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let mut game = game_ref.lock().unwrap();

                        // Verify caller is manager
                        if game.manager_socket_id != socket.id.to_string() {
                            return;
                        }

                        // Add bots (clamped to a reasonable max per batch)
                        let to_add = std::cmp::min(count, 100) as usize;
                        let existing_bots = game.players.iter()
                            .filter(|p| p.is_bot.unwrap_or(false))
                            .count();
                        let max_total = 50;
                        let room = std::cmp::max(0, max_total - existing_bots);
                        let actual_count = std::cmp::min(to_add, room);

                        if actual_count <= 0 {
                            return;
                        }

                        let bot_names = vec![
                            "Alex", "Bailey", "Casey", "Devon", "Elliot", "Finley",
                            "Gemini", "Harper", "Iris", "Jordan", "Kai", "Logan",
                            "Morgan", "Nathan", "Oakley", "Parker", "Quinn", "Riley",
                            "Scout", "Taylor", "Ulysses", "Valerie", "Wilder", "Xavier",
                        ];

                        for i in 0..actual_count {
                            let bot_name = bot_names[i % bot_names.len()].to_string();
                            let bot_socket_id = format!("bot-{}", uuid::Uuid::new_v4());
                            let bot_client_id = format!("bot-{}", uuid::Uuid::new_v4());

                            // Fresh v4 UUID client_id, so a dup-guard rejection
                            // here is not a real-world case — skip defensively.
                            let player = match game.add_player(
                                bot_socket_id.clone(),
                                bot_client_id,
                                bot_name,
                                None,
                            ) {
                                Ok(p) => p,
                                Err(_) => continue,
                            };

                            // Mark as bot
                            if !game.players.is_empty() {
                                if let Some(last_player) = game.players.last_mut() {
                                    last_player.is_bot = Some(true);
                                }
                            }

                            // Broadcast NEW_PLAYER
                            let new_player_payload = serde_json::json!({
                                "id": player.id,
                                "clientId": player.client_id,
                                "username": player.username,
                                "isBot": true,
                                "points": 0,
                                "streak": 0,
                                "connected": true,
                            });
                            ctx.io.to(game_id.clone())
                                .emit(constants::manager::NEW_PLAYER, &new_player_payload)
                                .ok();
                        }

                        // Broadcast TOTAL_PLAYERS once
                        let total = game.players.len() as i32;
                        ctx.io.to(game_id.clone())
                            .emit(constants::game::TOTAL_PLAYERS, &total)
                            .ok();

                        drop(game);
                    }
                }
            });
        }
    });
}
