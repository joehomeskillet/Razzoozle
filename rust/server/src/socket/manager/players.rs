//! MANAGER.KICK_PLAYER, ADD_BOTS — player management handlers

use super::super::HandlerCtx;
use crate::bot::BotManager;
use crate::is_game_host;
use razzoozle_protocol::constants;
use std::sync::Arc;
use razzoozle_engine::state::GamePhase;
use socketioxide::extract::{Data, SocketRef};
use std::collections::HashSet;
use tracing::warn;

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
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        warn!("manager control denied: event=kickPlayer check=require_user");
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                if let (Some(game_id), Some(player_id)) = (game_id_opt, player_id_opt) {
                    let (removed_count, bot_cancel, socket_id_to_deindex) = {
                        let registry = ctx.registry.read().await;
                        let game_opt = registry.get_game_by_id(&game_id);
                        if let Some(game_ref) = game_opt {
                            {
                                let game = game_ref.lock().unwrap();
                                if !is_game_host(&game, &payload, &ctx.client_id, Some(&user)) {
                                    warn!("manager control denied: event=kickPlayer gameId={} check=is_game_host", game_id);
                                    socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                    return;
                                }
                            }

                            let mut game = game_ref.lock().unwrap();
                            // SECURITY: Only the manager socket of THIS game can kick players from it
                            if game.manager_socket_id != socket.id.to_string() {
                                warn!("manager control denied: event=kickPlayer gameId={} check=manager_socket_mismatch expected={} got={}", game_id, game.manager_socket_id, socket.id);
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                            if let Some(pos) = game.players.iter().position(|p| p.id == player_id) {
                                let client_id = game.players[pos].client_id.clone();
                                let bot_manager = game.bot_manager.clone();
                                game.players.remove(pos);
                                game.engine.players.retain(|p| p.client_id != client_id);
                                game.engine.current_answers.remove(&client_id);
                                game.engine.answer_order.retain(|c| c != &client_id);
                                let cancel = if client_id.starts_with("bot-") {
                                    Some((bot_manager, client_id))
                                } else {
                                    None
                                };
                                (Some(game.players.len()), cancel, Some(player_id.clone()))
                            } else {
                                warn!("manager control failed: event=kickPlayer gameId={} playerId={} check=player_not_found", game_id, player_id);
                                (None, None, None)
                            }
                        } else {
                            warn!("manager control failed: event=kickPlayer gameId={} check=game_not_found", game_id);
                            (None, None, None)
                        }
                    };

                    // Remove the player from the socket_to_game index (#144)
                    if let Some(socket_id) = socket_id_to_deindex {
                        let mut registry = ctx.registry.write().await;
                        registry.deindex_player_socket(&socket_id);
                    }

                    if let Some((bot_manager, client_id)) = bot_cancel {
                        if let Some(bm) = bot_manager {
                            bm.cancel_pending(Some(&client_id)).await;
                        }
                    }

                    if let Some(total) = removed_count {
                        // Emit RESET directly to the kicked player via get_socket
                        if let Ok(sid) = player_id.parse() {
                            if let Some(player_socket) = ctx.io.get_socket(sid) {
                                player_socket
                                    .emit(constants::game::RESET, "errors:game.kickedByManager")
                                    .ok();
                            }
                        }
                        // Emit PLAYER_KICKED directly to the manager (the socket parameter is the manager)
                        socket
                            .emit(constants::manager::PLAYER_KICKED, &player_id)
                            .ok();
                        // Broadcast TOTAL_PLAYERS to all players in the game room
                        ctx.io
                            .to(game_id)
                            .emit(constants::game::TOTAL_PLAYERS, &(total as i32))
                            .ok();
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
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                // Extract gameId and count
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                let count_opt = payload.get("count").and_then(|v| v.as_i64());

                if let (Some(game_id), Some(count)) = (game_id_opt, count_opt) {
                    // Validate count is in [1, 50]
                    if count < 1 || count > 50 {
                        return;
                    }
                    let count = count as usize;
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
                            if !is_game_host(&game, &payload, &ctx.client_id, Some(&user)) {
                                warn!("manager control denied: event=addBots gameId={} check=is_game_host", game_id);
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let mut game = game_ref.lock().unwrap();

                        // Verify caller is manager
                        if game.manager_socket_id != socket.id.to_string() {
                            return;
                        }

                        // Check if answer window is open (cannot add bots during SelectAnswer phase)
                        if game.engine.phase == GamePhase::SelectAnswer {
                            socket.emit(
                                constants::manager::ERROR_MESSAGE,
                                "errors:manager.simWindowOpen"
                            ).ok();
                            return;
                        }

                        // Validate cumulative cap (BOT.MAX_TOTAL = 200)
                        let existing_bots = game.players.iter()
                            .filter(|p| p.is_bot.unwrap_or(false))
                            .count();
                        let max_total = 200;
                        let room = std::cmp::max(0, max_total - existing_bots);
                        let actual_count = std::cmp::min(count, room);

                        if actual_count <= 0 {
                            return;
                        }

                        let bot_names = vec![
                            "Alex", "Bailey", "Casey", "Devon", "Elliot", "Finley",
                            "Gemini", "Harper", "Iris", "Jordan", "Kai", "Logan",
                            "Morgan", "Nathan", "Oakley", "Parker", "Quinn", "Riley",
                            "Scout", "Taylor", "Ulysses", "Valerie", "Wilder", "Xavier",
                        ];

                        // Build set of taken names: existing roster + names being added in this batch
                        let mut taken_names: HashSet<String> = game.players.iter()
                            .map(|p| p.username.clone())
                            .collect();

                        for i in 0..actual_count {
                            // Find next available name from pool, or use numeric suffix
                            let bot_name = {
                                let mut found = None;
                                for base_name in &bot_names {
                                    if !taken_names.contains(*base_name) {
                                        found = Some(base_name.to_string());
                                        break;
                                    }
                                }
                                match found {
                                    Some(name) => name,
                                    None => {
                                        // Pool exhausted: use numeric suffix
                                        let mut suffix = 2;
                                        loop {
                                            let base_idx = (suffix - 2) % bot_names.len();
                                            let base = &bot_names[base_idx];
                                            let candidate = format!("{} {}", base, suffix);
                                            if !taken_names.contains(&candidate) {
                                                break candidate;
                                            }
                                            suffix += 1;
                                        }
                                    }
                                }
                            };
                            taken_names.insert(bot_name.clone());

                            let bot_socket_id = format!("bot-{}", uuid::Uuid::new_v4());
                            let bot_client_id = format!("bot-{}", uuid::Uuid::new_v4());

                            if game.bot_manager.is_none() {
                                game.bot_manager = Some(Arc::new(BotManager::new()));
                            }
                            if let Some(bm) = &game.bot_manager {
                                bm.add_bot_speed(bot_client_id.clone());
                            }

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

                            // Broadcast NEW_PLAYER only to the manager socket
                            let new_player_payload = serde_json::json!({
                                "id": player.id,
                                "clientId": player.client_id,
                                "username": player.username,
                                "isBot": true,
                                "points": 0,
                                "streak": 0,
                                "connected": true,
                            });
                            if let Ok(sid) = game.manager_socket_id.parse() {
                                if let Some(s) = ctx.io.get_socket(sid) {
                                    s.emit(constants::manager::NEW_PLAYER, &new_player_payload).ok();
                                }
                            }
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
