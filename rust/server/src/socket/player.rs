//! Player event handlers: JOIN, LOGIN, SELECTED_ANSWER, LEAVE, SELECT_TEAM, SET_AVATAR, RECONNECT
use super::HandlerCtx;
use razzoozle_engine::state::GamePhase;
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

/// Broadcast a player's team/avatar change: MANAGER.NEW_PLAYER (just the
/// changed player) to the manager socket, and PLAYER.UPDATE_LEADERBOARD (the
/// full roster) to the room. Mirrors Node's PlayerManager.broadcastPlayerUpdate
/// (called from game/index.ts setAvatar/selectTeam, game/index.ts:463-488).
/// Node additionally throttles the leaderboard emit (150ms coalescing via
/// ScoreboardThrottle) — not replicated here, since that's a perf optimization
/// rather than a functional parity gap.
fn broadcast_player_update(
    registry: &crate::state::GameRegistry,
    io_handle: &socketioxide::SocketIo,
    game_id: &str,
    manager_socket_id: &str,
    player: razzoozle_protocol::player::Player,
) {
    if let Ok(sid) = manager_socket_id.parse() {
        if let Some(mgr) = io_handle.get_socket(sid) {
            mgr.emit(constants::manager::NEW_PLAYER, &player).ok();
        }
    }

    if let Some(game_ref) = registry.get_game_by_id(game_id) {
        let leaderboard = game_ref.lock().unwrap().players.clone();
        io_handle
            .to(game_id.to_string())
            .emit(
                constants::player::UPDATE_LEADERBOARD,
                &razzoozle_protocol::player::PlayerUpdateLeaderboard { leaderboard },
            )
            .ok();
    }
}

fn register_join(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::JOIN, {
        let registry = ctx.registry.clone();

        move |socket: SocketRef, Data::<String>(invite_code)| {
            let registry = registry.clone();

            tokio::spawn(async move {
                // #11: Validate invite code is exactly 6 characters
                if invite_code.len() != 6 {
                    socket
                        .emit(constants::game::ERROR_MESSAGE, "errors:auth.invalidInviteCode")
                        .ok();
                    return;
                }

                let registry = registry.read().await;
                let game_opt = registry.get_game_by_code(&invite_code);

                match game_opt {
                    Some(game) => {
                        let game_data = game.lock().unwrap();
                        // #12: Read live game config for requireIdentifier flag (TODO: parity - currently returns None)
                        let payload = razzoozle_protocol::game::GameSuccessRoom {
                            game_id: game_data.game_id.clone(),
                            require_identifier: None, // TODO(parity): read from live config file
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
        let db_pool = ctx.db_pool.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = registry.clone();
            let socket_id = socket_id.clone();
            let client_id = client_id.clone();
            let io_handle = io_handle.clone();
            let db_pool = db_pool.clone();

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
                // #12: Extract identifier from payload (for identifierHash computation)
                let _identifier = payload
                    .get("data")
                    .and_then(|v| v.get("identifier"))
                    .and_then(|v| v.as_str());

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
                                // #1: Read live join_locked config once per login attempt —
                                // cheap (one login per player), same idiom as the low_latency
                                // snapshot read in game.rs's CREATE handler. Node reads this
                                // once at Game construction (this.joinLocked); Rust's Game
                                // doesn't cache config, so a per-login DB read is the
                                // cheapest correct source available today.
                                let (_, _, join_locked_opt, _, _) = crate::db::get_game_config(&db_pool).await;
                                let join_locked = join_locked_opt.unwrap_or(false);

                                let (game_id_ret, manager_socket_id, player, total_players) = {
                                    let mut game = game_ref.lock().unwrap();

                                    // #2: Check if game has finished (engine phase Finished)
                                    if game.engine.phase == GamePhase::Finished {
                                        drop(game);
                                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.gameEnded").ok();
                                        return;
                                    }

                                    // #1: Reject NEW players while the lobby is locked; an
                                    // existing player (reconnect-via-login) is unaffected
                                    // (Node player-manager.ts join(): getJoinLocked() && !existing).
                                    let already_joined = game.players.iter().any(|p| p.client_id == client_id);
                                    if join_locked && !already_joined {
                                        drop(game);
                                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.locked").ok();
                                        return;
                                    }

                                    // H — per-game player cap
                                    if game.players.len() >= crate::state::MAX_PLAYERS_PER_GAME {
                                        drop(game);
                                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.gameFull").ok();
                                        return;
                                    }

                                    let player = match game.add_player(
                                        socket_id.clone(),
                                        client_id.clone(),
                                        username.to_string(),
                                        avatar,
                                    ) {
                                        Ok(p) => p,
                                        Err(e) => {
                                            drop(game);
                                            socket.emit(constants::game::ERROR_MESSAGE, e).ok();
                                            return;
                                        }
                                    };

                                    let game_id = game.game_id.clone();
                                    let manager_socket_id = game.manager_socket_id.clone();
                                    let total_players = game.players.len();

                                    (game_id, manager_socket_id, player, total_players)
                                };

                                // O(1) socket_id -> game_id index (state.rs) — keeps
                                // remove/mark-disconnected/set_player_team/set_player_avatar
                                // off the old full-scan path for this connection.
                                {
                                    let mut registry = registry.write().await;
                                    registry.index_player_socket(socket_id.clone(), game_id_ret.clone());
                                }

                                info!(
                                    "Player joined game: gameId={}, username={}",
                                    game_id_ret, username
                                );

                                socket.join(game_id_ret.clone()).ok();

                                // SUCCESS_JOIN carries gameId + playerToken as an OBJECT (matches
                                // node player-manager.ts join()). The client's Username.tsx reads
                                // `payload.gameId` to navigate to `/party/$gameId` and
                                // `payload.playerToken` to persist the reconnect token — a bare
                                // string left both undefined, routing the player to
                                // `/party/undefined`.
                                socket
                                    .emit(
                                        constants::game::SUCCESS_JOIN,
                                        &razzoozle_protocol::game::GameSuccessJoin {
                                            game_id: game_id_ret.clone(),
                                            player_token: player.player_token.clone(),
                                        },
                                    )
                                    .ok();

                                if let Ok(sid) = manager_socket_id.parse() {
                                    if let Some(mgr) = io_handle.get_socket(sid) {
                                        mgr.emit(constants::manager::NEW_PLAYER, &player).ok();
                                    }
                                }

                                // #10: Use io.to(room) to broadcast to all sockets in room including sender
                                io_handle
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

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = registry.clone();
            let io_handle = io_handle.clone();
            let client_id = client_id.clone();

            tokio::spawn(async move {
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                // Extract all answer fields
                let data_obj = payload.get("data");

                // #6: Validate answer data shape (must be non-null object)
                if data_obj.is_none() || !data_obj.unwrap().is_object() {
                    socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                    return;
                }

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
                    });

                // #6: Validate answerKeys array is 1-4 elements if present
                if let Some(ref keys) = answer_keys_opt {
                    if keys.is_empty() || keys.len() > 4 {
                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                        return;
                    }
                }

                let answer_text_opt = data_obj
                    .and_then(|v| v.get("answerText"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // #6: Validate answerText ≤ 400 chars if present
                if let Some(ref text) = answer_text_opt {
                    if text.len() > 400 {
                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                        return;
                    }
                }

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
                            )
                        };

                        // #6: Handle InvalidAnswerShape error from engine
                        match record_result {
                            Ok(_) => {
                                let answer_count = {
                                    let game = game_ref.lock().unwrap();
                                    game.engine.current_answers.len() as i32
                                };

                                let game_id = game_id.to_string();
                                // Emit game:playerAnswer (count) to all in room
                                io_handle.to(game_id.clone())
                                    .emit(constants::game::PLAYER_ANSWER, &answer_count).ok();

                                // Emit WAIT status to the answering player's OWN socket only —
                                // matches node's `this.send(socket.id, STATUS.WAIT, ...)`
                                // (round-manager.ts selectAnswer()). Broadcasting this to the
                                // whole room (the previous rust behaviour) flipped the
                                // manager's AND every other still-answering player's screen
                                // away from the Answers view (losing the live X/Y count and,
                                // for other players, the answer buttons themselves) as soon as
                                // ONE player answered — which is exactly why the host got
                                // stuck on "0/1" and "all answered" never fired.
                                let wait_status = GameStatus::Wait(WaitData {
                                    text: "game:waitingForAnswers".to_string(),
                                    team_mode: None,
                                });
                                socket
                                    .emit(constants::game::STATUS, &wait_status).ok();

                                // #7: Auto-advance if all players (connected + disconnected) have answered
                                let should_auto_advance = {
                                    let game = game_ref.lock().unwrap();
                                    if game.engine.phase != GamePhase::SelectAnswer {
                                        false
                                    } else {
                                        let total_player_count = game.players.len();
                                        let answered_count = game.engine.current_answers.len();

                                        // Fire only if all players (including disconnected) have answered and we have at least 1 player
                                        total_player_count > 0 && answered_count >= total_player_count
                                    }
                                };

                                if should_auto_advance {
                                    // Don't reveal directly here — signal the game-lifecycle
                                    // task's per-question cooldown ticker (socket::lifecycle::
                                    // run_game_lifecycle) to wake immediately instead. It is the
                                    // ONE place that calls engine.reveal()/perform_reveal_and_
                                    // broadcast, so a natural timeout racing this all-answered
                                    // signal can never double-reveal (engine.reveal() is also
                                    // phase-guarded as a second line of defence).
                                    super::lifecycle::request_abort(&game_ref, GamePhase::SelectAnswer);
                                }
                            }
                            Err(_) => {
                                // Engine returned an error (e.g., InvalidAnswerShape)
                                socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                            }
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
                // #3: mark_player_disconnected is already phase-aware (lobby =
                // hard-remove, started = keep the slot + mark disconnected) —
                // exactly the split Node's handlePlayerLeave implements
                // (game.ts:54-66: !game.started -> removePlayer, else
                // setPlayerDisconnected). Reusing it here instead of
                // remove_player_by_socket_id puts an intentional LEAVE and a
                // transport disconnect on the same state-mutation path.
                let result = {
                    let mut registry = registry.write().await;
                    registry.mark_player_disconnected(&socket_id)
                };

                if let Some((game_id, manager_socket_id, removed_player_id, total_players, removed)) = result {
                    // Node's setPlayerDisconnected/removePlayer both always
                    // broadcast TOTAL_PLAYERS regardless of phase.
                    io_handle
                        .to(game_id)
                        .emit(constants::game::TOTAL_PLAYERS, &(total_players as i32))
                        .ok();

                    // Lobby hard-remove only: mirror Node's removePlayer, which
                    // additionally tells the manager to drop this roster row.
                    if removed {
                        if let Ok(sid) = manager_socket_id.parse() {
                            if let Some(mgr) = io_handle.get_socket(sid) {
                                mgr.emit(constants::manager::REMOVE_PLAYER, &removed_player_id).ok();
                            }
                        }
                    }
                }
            });
        }
    });
}

fn register_select_team(socket: &SocketRef, ctx: HandlerCtx) {
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
                let (team_mode_opt, _, _, _, _) = crate::db::get_game_config(&db_pool).await;
                if !team_mode_opt.unwrap_or(false) || !crate::state::TEAMS.contains(&team_id.as_str()) {
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

fn register_set_avatar(socket: &SocketRef, ctx: HandlerCtx) {
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

                                (game_id_ret, old_socket_id, username, points, streak)
                            })
                        };

                        if let Some((game_id_ret, old_socket_id, username, points, streak)) = update_result {
                            // Keep the O(1) socket_id -> game_id index (state.rs)
                            // current: this player's socket_id just changed.
                            {
                                let mut registry = registry.write().await;
                                registry.deindex_player_socket(&old_socket_id);
                                registry.index_player_socket(socket_id.clone(), game_id_ret.clone());
                            }

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
