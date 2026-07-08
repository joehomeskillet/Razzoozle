use super::HandlerCtx;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::{GameStatus, WaitData};
use serde_json;
use socketioxide::extract::{Data, SocketRef};
use tracing::info;

pub(super) fn register_join(socket: &SocketRef, ctx: HandlerCtx) {
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

pub(super) fn register_login(socket: &SocketRef, ctx: HandlerCtx) {
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
                                let (team_mode_opt, _, join_locked_opt, _, _) = crate::db::get_game_config(&db_pool).await;
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

                                // N7 parity: push lobby WAIT (carrying teamMode) to the joining player's OWN socket
                                // after SUCCESS_JOIN — node index.ts join()->sendLobbyWait(). Client's own
                                // SUCCESS_JOIN-driven WAIT lacks teamMode, so the team picker never shows without this.
                                // Emit directly on socket (SocketRef in scope) — do NOT use io.to(sid): socketioxide
                                // has no per-socket-id room so it would go nowhere.
                                let wait_status = GameStatus::Wait(WaitData {
                                    text: "game:waitingForPlayers".to_string(),
                                    team_mode: Some(team_mode_opt.unwrap_or(false)),
                                });
                                socket.emit(constants::game::STATUS, &wait_status).ok();

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
