//! MANAGER.AUTH, LOGOUT, RECONNECT — manager session handlers

use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use crate::http::RATE_LIMITER;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

const DEFAULT_MANAGER_PASSWORD: &str = "PASSWORD";

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_auth(socket, ctx.clone());
    register_logout(socket, ctx.clone());
    register_reconnect(socket, ctx.clone());
}

/// Constant-time, length-checked byte compare. Mirrors Node's
/// `presented.length !== expected.length || !timingSafeEqual(...)` — a length
/// mismatch is itself a rejection (checked first, short-circuiting before the
/// fixed-time fold), so response timing never leaks the real password length
/// or contents. No `subtle`/`constant_time_eq` crate in Cargo.toml (checked
/// before writing this), so this hand-rolls the XOR-fold instead of adding a
/// new dependency.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }

    diff == 0
}

fn register_auth(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::AUTH, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<String>(password)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let expected_password = match db::get_manager_password(&ctx.db_pool).await {
                    Some(pw) => pw,
                    None => std::env::var("MANAGER_PASSWORD")
                        .unwrap_or_else(|_| DEFAULT_MANAGER_PASSWORD.to_string()),
                };

                // Refuse EVERY login while the configured password is still the
                // shipped default — mirrors Node (auth.ts:34-41): a host must
                // set a real password before manager:auth can ever succeed, so
                // a forgotten/unconfigured install can't be logged into with
                // the publicly-known default. Checked BEFORE the throttle/
                // compare, same order as Node.
                if expected_password == DEFAULT_MANAGER_PASSWORD {
                    socket
                        .emit(
                            constants::manager::ERROR_MESSAGE,
                            "errors:manager.passwordNotConfigured",
                        )
                        .ok();

                    return;
                }

                // Server-wide brute-force throttle: PEEK (no increment) before
                // comparing, so a throttled window rejects even a
                // would-be-correct password with the SAME invalidPassword key
                // (deliberately hides the throttle) instead of a distinct
                // (and previously non-existent) authThrottled key. Global —
                // not per-client_id — window, matching Node's single
                // module-level counter (trivially bypassed per-client-id
                // counters are pointless since a client can mint a fresh
                // clientId for free).
                if RATE_LIMITER.is_auth_throttled_global() {
                    socket
                        .emit(
                            constants::manager::ERROR_MESSAGE,
                            "errors:manager.invalidPassword",
                        )
                        .ok();

                    return;
                }

                if !constant_time_eq(password.as_bytes(), expected_password.as_bytes()) {
                    // Only a REAL failed compare counts toward the throttle
                    // (never on success — the previous code incremented
                    // unconditionally, trivially defeated by reconnecting).
                    RATE_LIMITER.record_auth_failure_global();
                    socket
                        .emit(
                            constants::manager::ERROR_MESSAGE,
                            "errors:manager.invalidPassword",
                        )
                        .ok();

                    return;
                }

                {
                    let mut registry = ctx.registry.write().await;
                    registry.login_client(ctx.client_id.clone());
                }

                // Emit manager:config with all manager-visible data (also
                // re-pushes ai:settings on every successful auth — see
                // config_helper.rs).
                config_helper::build_and_emit_config(&socket, &ctx).await;
                socket.emit(constants::ai::SETTINGS, &super::super::ai_config::get_public_ai_settings()).ok();
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

                // OWNERSHIP, not prior is_logged, gates reconnect — mirrors
                // Node (game.ts:95-116): registry.getManagerGame(gameId,
                // clientId) alone is treated as proof of prior authentication,
                // and managerAuth.login(socket) is called UNCONDITIONALLY
                // whenever that ownership match succeeds. The old Rust code
                // required is_logged to ALREADY be true before it would even
                // look at ownership — but is_logged (loggedClients) is
                // in-memory and wiped on every server restart, so a genuine
                // host could never pass that gate again and was permanently
                // locked out of a running game (chicken-and-egg).
                //
                // is_game_host() now checks REAL ownership via
                // game.manager_client_id (state.rs) when no hostToken is sent
                // — the shipped client's manager:reconnect only sends
                // {gameId} — instead of the old blanket "hostToken absent ->
                // allow" legacy branch. Byte-for-byte match of Node's
                // clientId-based ownership model.
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

                // Ownership verified: (re-)establish login UNCONDITIONALLY,
                // regardless of prior is_logged state (fixes the restart
                // chicken-and-egg lockout). Also refresh manager_client_id to
                // this reconnecting clientId, keeping ownership current across
                // e.g. a cleared-localStorage reconnect that mints a new one.
                {
                    let mut registry = ctx.registry.write().await;
                    registry.login_client(ctx.client_id.clone());
                }
                {
                    let mut game = game_ref.lock().unwrap();
                    game.manager_client_id = Some(ctx.client_id.clone());
                }

                let new_socket_id = socket.id.to_string();

                // Reject while a DIFFERENT manager socket is still genuinely
                // connected — mirrors Node's `this._manager.connected` guard
                // (GAME.RESET "errors:game.managerAlreadyConnected"). Rust's
                // Game has no `connected` bool (state.rs owns that struct),
                // so liveness is checked via the socket.io registry instead:
                // if the previously-stored manager_socket_id still resolves
                // to a live socket, and it isn't THIS reconnecting socket,
                // refuse instead of stealing the connection out from under
                // the still-live tab.
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

                // TODO(parity): Node also calls registry.reactivateGame(gameId)
                // here, pulling the game out of the empty-grace cleanup
                // window armed by a manager disconnect. Rust's GameRegistry
                // has no empty-grace/reactivate mechanism at all yet (grep
                // confirms no markGameAsEmpty/reactivateGame equivalent) — so
                // there is nothing to hook into without adding that whole
                // subsystem, which is out of scope for this auth-only fix.

                let (game_id, players, current_question_index, total_questions, phase) = {
                    let mut game = game_ref.lock().unwrap();
                    game.manager_socket_id = new_socket_id;
                    (
                        game.game_id.clone(),
                        game.players.clone(),
                        game.engine.current_question_index,
                        game.engine.quiz.questions.len(),
                        game.engine.phase,
                    )
                };

                socket.join(game_id.clone());

                // status.name is derived from the live engine phase (cheap +
                // accurate). `data` is best-effort: Rust has no
                // managerStatus/lastBroadcastStatus tracking (Node's
                // round-manager status system), so only the WAIT/lobby case
                // gets the exact literal Node itself falls back to when
                // nothing has been broadcast yet. TODO(parity): port
                // per-phase status data (question/result/leaderboard
                // payloads) once the engine tracks a broadcastable status, so
                // a manager reconnecting mid-game gets the full
                // SHOW_QUESTION/SHOW_RESULT/... data instead of an empty
                // object.
                let (status_name, status_data) = match phase {
                    GamePhase::ShowRoom => {
                        ("WAIT", serde_json::json!({ "text": "game:waitingForPlayers" }))
                    }
                    GamePhase::ShowStart => ("SHOW_START", serde_json::json!({})),
                    GamePhase::ShowQuestion => ("SHOW_QUESTION", serde_json::json!({})),
                    GamePhase::SelectAnswer => ("SELECT_ANSWER", serde_json::json!({})),
                    GamePhase::ShowResult => ("SHOW_RESULT", serde_json::json!({})),
                    GamePhase::ShowRoundRecap => ("SHOW_ROUND_RECAP", serde_json::json!({})),
                    GamePhase::ShowLeaderboard => ("SHOW_LEADERBOARD", serde_json::json!({})),
                    GamePhase::Finished => ("FINISHED", serde_json::json!({})),
                };

                // currentQuestion mirrors Node's round.getReconnectInfo()
                // ({current: index+1, total}) — trivially available from the
                // engine's own current_question_index/quiz.questions.len(),
                // unlike `status.data` above.
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

                // NB: no PLAYER_RECONNECTED broadcast here (removed) — Node
                // only emits manager:playerReconnected (to the manager's own
                // socket, with {id, username}) when a PLAYER reconnects, never
                // on a MANAGER reconnect. The old code broadcast an empty `{}`
                // to the whole room on every manager reconnect, which has no
                // Node equivalent.
            });
        }
    });
}
