use super::broadcast_player_update;
use super::HandlerCtx;
use razzoozle_protocol::constants;
use razzoozle_protocol::player::{PlayerSuccessReconnect, PlayerReconnectInfo, GameUpdateQuestion};
use serde_json;
use socketioxide::extract::{Data, SocketRef};

pub(super) fn register_leave(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::LEAVE, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let socket_id = socket.id.to_string();

        move |_socket: SocketRef, Data::<serde_json::Value>(_payload)| {
            let registry = registry.clone();
            let io_handle = io_handle.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                // #3: mark_player_disconnected is already phase-aware (lobby =
                // hard-remove, started = keep the slot + mark disconnected) —
                // exactly the split Node's handlePlayerLeave implements
                // (game.ts:54-66: !game.started -> removePlayer, else
                // setPlayerDisconnected). Intentional LEAVE keeps
                // lobby_hard_remove=true (unlike transport disconnect, #83).
                let result = {
                    let mut registry = registry.write().await;
                    registry.mark_player_disconnected(&socket_id, true)
                };

                if let Some((game_id, manager_socket_id, removed_player_socket_id, total_players, removed)) = result {
                    // Node's setPlayerDisconnected/removePlayer both always
                    // broadcast TOTAL_PLAYERS regardless of phase.
                    io_handle
                        .to(game_id)
                        .emit(constants::game::TOTAL_PLAYERS, &(total_players as i32))
                        .ok();

                    // Lobby hard-remove only: mirror Node's removePlayer, which
                    // additionally tells the manager to drop this roster row.
                    // #84: manager roster keys players by socket id — send that,
                    // not client_id.
                    if removed {
                        if let Ok(sid) = manager_socket_id.parse() {
                            if let Some(mgr) = io_handle.get_socket(sid) {
                                mgr.emit(constants::manager::REMOVE_PLAYER, &removed_player_socket_id).ok();
                            }
                        }
                    }
                }
            });
        }
    });
}

pub(super) fn register_select_team(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::SELECT_TEAM, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let db_pool = ctx.db_pool.clone();
        let socket_id = socket.id.to_string();

        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let team_id_opt = payload.get("teamId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let registry = registry.clone();
            let io_handle = io_handle.clone();
            let db_pool = db_pool.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                let Some(team_id) = team_id_opt else {
                    return;
                };

                // #8: Team-mode gate + TEAMS enum check, mirroring Node's
                // RoundManager.selectTeam (round-manager.ts:1459-1477): silent
                // no-op when team mode is off or teamId isn't a real team.
                // teamMode isn't cached on Rust's Game yet, so — same idiom as
                // the join_locked read in register_login — a live config read
                // per pick is the cheapest correct source (picks are
                // infrequent: once per player, in the lobby).
                // #8: Team-mode gate + TEAMS enum check (W1-M2): read from per-game snapshot
                // instead of global config
                let team_mode_enabled = {
                    let registry = registry.read().await;
                    let candidates = registry.socket_lookup_candidates(&socket_id);
                    // ponytail: trust ONLY a unique candidate. socket_lookup_candidates
                    // returns ALL games when the socket isn't mapped (fail-open); fail
                    // closed when ambiguous so team-select can't read a random game's gate.
                    if candidates.len() == 1 {
                        candidates[0].lock().unwrap().selected_modes.team_mode.unwrap_or(false)
                    } else {
                        false
                    }
                };
                if !team_mode_enabled || !crate::state::TEAMS.contains(&team_id.as_str()) {
                    return;
                }

                let registry = registry.read().await;
                if let Some((player, game_id, manager_socket_id)) = registry.set_player_team(&socket_id, team_id) {
                    broadcast_player_update(&registry, &io_handle, &game_id, &manager_socket_id, player);
                }
            });
        }
    });
}

pub(super) fn register_set_avatar(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::SET_AVATAR, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let socket_id = socket.id.to_string();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let avatar_opt = payload.get("avatar")
                .or_else(|| payload.get("data").and_then(|v| v.get("avatar")))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let registry = registry.clone();
            let io_handle = io_handle.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                let Some(avatar) = avatar_opt else {
                    return;
                };

                // #9: Validate avatar format (dicebear: prefix or data: URI
                // only) — mirrors Node's resolveAvatar (game/index.ts:490-549):
                // an unrecognized prefix is a real rejection, not a silent drop.
                if !avatar.starts_with("dicebear:") && !avatar.starts_with("data:") {
                    socket.emit(constants::game::ERROR_MESSAGE, "errors:avatar.invalid").ok();
                    return;
                }

                // Additional validation for dicebear (Node: length<=200 check
                // in resolveAvatar's dicebear branch, else avatar.invalid)
                if avatar.starts_with("dicebear:") && avatar.len() > 200 {
                    socket.emit(constants::game::ERROR_MESSAGE, "errors:avatar.invalid").ok();
                    return;
                }

                // SVG data-URIs are stored verbatim (no transcode) but are
                // still capped by AVATAR_SVG_MAX_CHARS (Node's resolveAvatar
                // svg branch: length > AVATAR_SVG_MAX_CHARS -> avatar.tooLarge).
                if avatar.starts_with("data:image/svg+xml")
                    && avatar.len() > crate::state::AVATAR_SVG_MAX_CHARS
                {
                    socket.emit(constants::game::ERROR_MESSAGE, "errors:avatar.tooLarge").ok();
                    return;
                }

                let registry = registry.read().await;
                if let Some((player, game_id, manager_socket_id)) = registry.set_player_avatar(&socket_id, avatar) {
                    broadcast_player_update(&registry, &io_handle, &game_id, &manager_socket_id, player);
                }
            });
        }
    });
}

pub(super) fn register_reconnect(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::RECONNECT, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let socket_id = socket.id.to_string();
        let client_id = ctx.client_id.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = registry.clone();
            let io_handle = io_handle.clone();
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
                        // The whole game-lock-holding computation lives in this
                        // block so the MutexGuard (!Send) is fully dropped
                        // before the .await below — otherwise the enclosing
                        // future can't be spawned (tokio::spawn requires Send).
                        let update_result = {
                            let mut game = game_ref.lock().unwrap();

                            // #4: Anti-spoof: check if player_token was minted for this clientId
                            let mut pos_opt = if let Some(token) = player_token_opt {
                                // Token-based lookup (secure): require exact token match
                                game.players.iter().position(|p| p.player_token.as_deref() == Some(token))
                            } else {
                                // Fallback to clientId (backward-compat), but only if no token was required
                                game.players.iter().position(|p| p.client_id == client_id)
                            };

                            // Reject regardless of which lookup path matched if the
                            // clientId-matched player already has a minted token that
                            // doesn't match the one supplied (or none was supplied) —
                            // mirrors Node's reconnectPlayer (game/index.ts:667-674):
                            // storedToken !== undefined && playerToken !== storedToken
                            // -> reject. Without this an omitted/wrong token could still
                            // hijack the clientId-fallback lookup for a player who
                            // already holds a real token.
                            if let Some(matched) = game.players.iter().find(|p| p.client_id == client_id) {
                                if matched.player_token.is_some()
                                    && matched.player_token.as_deref() != player_token_opt
                                {
                                    pos_opt = None;
                                }
                            }

                            pos_opt.map(|pos| {
                                let game_id_ret = game.game_id.clone();
                                let old_socket_id = game.players[pos].id.clone();
                                let manager_socket_id = game.manager_socket_id.clone();
                                let player_client_id = game.players[pos].client_id.clone();

                                game.players[pos].id = socket_id.clone();
                                game.players[pos].connected = true;

                                // Update engine players
                                if let Some(engine_pos) = game.engine.players.iter().position(|p| p.client_id == game.players[pos].client_id) {
                                    game.engine.players[engine_pos].id = socket_id.clone();
                                    game.engine.players[engine_pos].connected = true;
                                }

                                // Read points from engine.players (where scoring happens)
                                let username = if let Some(engine_pos) = game.engine.players.iter().position(|p| p.client_id == game.players[pos].client_id) {
                                    game.engine.players[engine_pos].username.clone()
                                } else {
                                    game.players[pos].username.clone()
                                };
                                let points = if let Some(engine_pos) = game.engine.players.iter().position(|p| p.client_id == game.players[pos].client_id) {
                                    game.engine.players[engine_pos].points
                                } else {
                                    game.players[pos].points
                                };

                                // Build currentQuestion (mirrors Node's round.getReconnectInfo())
                                let current_question_index = game.engine.current_question_index as i32;
                                let total_questions = game.engine.quiz.questions.len() as i32;

                                // Get the game status (mirrors Node's playerStatus.get or lastBroadcastStatus)
                                let (status_name, status_data) = game.manager_reconnect_status();
                                let status = serde_json::json!({ "name": status_name, "data": status_data });

                                // Check if player already answered current question (low-latency mode)
                                let already_answered = if game.low_latency {
                                    Some(game.engine.current_answers.contains_key(&player_client_id))
                                } else {
                                    None
                                };

                                let total_players = game.players.len() as i32;

                                (game_id_ret, old_socket_id, manager_socket_id, username, points,
                                 current_question_index, total_questions, status, already_answered, total_players)
                            })
                        };

                        if let Some((game_id_ret, old_socket_id, manager_socket_id, username, points,
                                    current_question_index, total_questions, status, already_answered, total_players)) = update_result {
                            // Keep the O(1) socket_id -> game_id index (state.rs)
                            // current: this player's socket_id just changed.
                            {
                                let mut registry = registry.write().await;
                                registry.deindex_player_socket(&old_socket_id);
                                registry.index_player_socket(socket_id.clone(), game_id_ret.clone());
                            }

                            // Join the room
                            socket.join(game_id_ret.clone());

                            // Emit reconnect success with full player state (parity with Node)
                            let reconnect_payload = PlayerSuccessReconnect {
                                game_id: game_id_ret.clone(),
                                status,
                                player: PlayerReconnectInfo {
                                    username,
                                    points,
                                },
                                current_question: GameUpdateQuestion {
                                    current: current_question_index + 1,
                                    total: total_questions,
                                },
                                already_answered,
                            };
                            socket.emit(constants::player::SUCCESS_RECONNECT, &reconnect_payload).ok();

                            // Notify manager of player reconnect (Node game-reconnect.ts:134)
                            if let Ok(sid) = manager_socket_id.parse() {
                                if let Some(mgr) = io_handle.get_socket(sid) {
                                    mgr.emit(constants::manager::PLAYER_RECONNECTED, &serde_json::json!({
                                        "id": socket_id,
                                        "oldId": old_socket_id,
                                        "username": reconnect_payload.player.username,
                                    })).ok();
                                }
                            }

                            // Send total players to reconnecting socket only (Node game-reconnect.ts:138)
                            socket.emit(constants::game::TOTAL_PLAYERS, &total_players).ok();
                        } else {
                            // #5: Emit GAME.RESET on reconnect failure (not ERROR_MESSAGE)
                            // This ensures the client navigates home instead of showing an error toast
                            socket.emit(constants::game::RESET, "errors:game.playerNotFound").ok();
                        }
                    } else {
                        // #5: Emit GAME.RESET on game not found
                        socket.emit(constants::game::RESET, "errors:game.notFound").ok();
                    }
                }
            });
        }
    });
}
