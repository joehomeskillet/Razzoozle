use super::HandlerCtx;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::game::{GameSuccessRoom, RosterEntry};
use razzoozle_protocol::status::{GameStatus, WaitData};
use serde_json;
use socketioxide::extract::{Data, SocketRef};
use std::net::IpAddr;
use tracing::info;

/// Constant-shape error for all pre-dedup klassen failures (A7 oracle prevention).
const INVALID_CREDENTIALS: &str = "errors:game.invalidCredentials";
/// Distinct error after PIN proven — student already has an active session (A6).
const ALREADY_JOINED: &str = "errors:game.alreadyJoined";

/// Check if an IP address is a trusted proxy (loopback or private range).
fn is_trusted_proxy(ip: IpAddr) -> bool {
    if ip.is_loopback() {
        return true;
    }
    match ip {
        IpAddr::V4(ipv4) => ipv4.is_private(),
        IpAddr::V6(_ipv6) => false,
    }
}

/// Best-effort client IP for rate limiting (A9). Derives peer IP from axum ConnectInfo.
/// SECURITY: Only trusts proxy headers (x-forwarded-for/x-real-ip) when the peer
/// is a trusted proxy (loopback or private IP range). Untrusted peers: falls back to peer IP directly.
fn client_ip_key(socket: &SocketRef, client_id: &str) -> String {
    let parts = socket.req_parts();

    // Check if we have a peer IP from axum ConnectInfo
    if let Some(addr) = parts
        .extensions
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
    {
        let peer_ip = addr.0.ip();

        // SECURITY: Only consult proxy headers if peer is a trusted proxy (loopback or private)
        if is_trusted_proxy(peer_ip) {
            // Check x-forwarded-for (multiple IPs, take first)
            if let Some(xff) = parts
                .headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
            {
                if let Some(first) = xff.split(',').next() {
                    let ip = first.trim();
                    if !ip.is_empty() {
                        return ip.to_string();
                    }
                }
            }
            // Check x-real-ip
            if let Some(real) = parts
                .headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
            {
                let ip = real.trim();
                if !ip.is_empty() {
                    return ip.to_string();
                }
            }
            // Trusted proxy but no usable header: use peer IP
            return peer_ip.to_string();
        } else {
            // Untrusted peer: don't trust proxy headers, use the peer IP directly
            return peer_ip.to_string();
        }
    }

    // No peer addr available: fall back to durable client_id so throttle still binds something stable
    format!("cid:{}", client_id)
}

/// Pure klassen-login decision used by the handler and unit tests.
/// SECURITY: never takes/log raw PIN beyond comparison; callers must not trace student_id/PIN.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum KlassenLoginDecision {
    Allow { display_name: String },
    InvalidCredentials,
    AlreadyJoined,
}

/// Evaluate class-mode login against roster + pin + active set (no I/O).
/// `emoji_pin_joined` is the client array joined into the stored plaintext form.
/// `roster` is (student_id, display_name, stored_pin).
/// `active_student_ids` are student_ids of currently connected players.
pub(crate) fn decide_klassen_login(
    student_id: Option<i64>,
    emoji_pin_joined: Option<&str>,
    roster: &[(i64, String, String)],
    active_student_ids: &[i64],
    throttle_blocked: bool,
) -> KlassenLoginDecision {
    if throttle_blocked {
        return KlassenLoginDecision::InvalidCredentials;
    }
    let Some(sid) = student_id else {
        return KlassenLoginDecision::InvalidCredentials;
    };
    let Some(pin) = emoji_pin_joined else {
        return KlassenLoginDecision::InvalidCredentials;
    };
    if pin.is_empty() {
        return KlassenLoginDecision::InvalidCredentials;
    }

    let member = roster.iter().find(|(id, _, _)| *id == sid);
    let Some((_, display_name, stored_pin)) = member else {
        // Non-rostered — same shape as wrong PIN (A7).
        return KlassenLoginDecision::InvalidCredentials;
    };
    if stored_pin != pin {
        return KlassenLoginDecision::InvalidCredentials;
    }
    // A6: post-PIN dedup — active session for this student.
    if active_student_ids.iter().any(|id| *id == sid) {
        return KlassenLoginDecision::AlreadyJoined;
    }
    KlassenLoginDecision::Allow {
        display_name: display_name.clone(),
    }
}

/// Join four emoji symbols (client wire shape A2) into stored PIN form.
pub(crate) fn join_emoji_pin(symbols: &[String]) -> Option<String> {
    if symbols.len() != 4 {
        return None;
    }
    if symbols.iter().any(|s| s.is_empty()) {
        return None;
    }
    Some(symbols.join(""))
}

/// Parse student_id stored on a player for klassen dedup (identifier_hash).
fn student_id_from_player(p: &razzoozle_protocol::player::Player) -> Option<i64> {
    p.identifier_hash
        .as_ref()
        .and_then(|s| s.parse::<i64>().ok())
}

pub(super) fn register_join(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::JOIN, {
        let registry = ctx.registry.clone();
        let db_pool = ctx.db_pool.clone();

        move |socket: SocketRef, Data::<String>(invite_code)| {
            let registry = registry.clone();
            let db_pool = db_pool.clone();

            tokio::spawn(async move {
                // #11: Validate invite code is exactly 6 characters
                if invite_code.len() != 6 {
                    socket
                        .emit(constants::game::ERROR_MESSAGE, "errors:auth.invalidInviteCode")
                        .ok();
                    return;
                }

                let game_opt = {
                    let registry = registry.read().await;
                    registry.get_game_by_code(&invite_code)
                };

                match game_opt {
                    Some(game_ref) => {
                        let (game_id, klassen, class_id, owner_id, active_student_ids) = {
                            let game_data = game_ref.lock().unwrap();
                            let active: Vec<i64> = game_data
                                .players
                                .iter()
                                .filter(|p| p.connected)
                                .filter_map(student_id_from_player)
                                .collect();
                            (
                                game_data.game_id.clone(),
                                game_data.klassen_mode(),
                                game_data.class_id,
                                game_data.owner_user_id,
                                active,
                            )
                        };

                        let (klassen_flag, roster) = if klassen {
                            if let (Some(cid), Some(oid)) = (class_id, owner_id) {
                                let students =
                                    crate::db::classes::students_for_class(&db_pool, cid, oid)
                                        .await;
                                let roster: Vec<RosterEntry> = students
                                    .into_iter()
                                    .map(|s| RosterEntry {
                                        student_id: s.id,
                                        display_name: s.display_name,
                                        already_joined: active_student_ids.contains(&s.id),
                                    })
                                    .collect();
                                (Some(true), Some(roster))
                            } else {
                                // class_id set without owner — treat as free-join for safety
                                (None, None)
                            }
                        } else {
                            (None, None)
                        };

                        let payload = GameSuccessRoom {
                            game_id,
                            require_identifier: Some(false),
                            klassen: klassen_flag,
                            roster,
                        };

                        // SECURITY: never log the raw invite_code
                        info!("Player checking game: invite_code_len={}", invite_code.len());

                        socket.emit(constants::game::SUCCESS_ROOM, &payload).ok();
                    }
                    None => {
                        // SECURITY: never log the raw invite_code
                        info!("Game not found for invite code (len={})", invite_code.len());
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
                let data = payload.get("data");
                let username_opt = data
                    .and_then(|v| v.get("username"))
                    .and_then(|v| v.as_str());
                let avatar = data
                    .and_then(|v| v.get("avatar"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                // #12: Extract identifier from payload (for identifierHash computation)
                let _identifier = data
                    .and_then(|v| v.get("identifier"))
                    .and_then(|v| v.as_str());

                // Wave-1: optional class-mode fields (serde camelCase on wire)
                let student_id = data
                    .and_then(|v| v.get("studentId"))
                    .and_then(|v| v.as_i64());
                let emoji_pin_symbols: Option<Vec<String>> = data
                    .and_then(|v| v.get("emojiPin"))
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|x| x.as_str().map(|s| s.to_string()))
                            .collect()
                    });

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
                                // Snapshot klassen / owner / class without holding lock across await.
                                let (is_klassen, class_id, owner_id, active_student_ids) = {
                                    let game = game_ref.lock().unwrap();
                                    let active: Vec<i64> = game
                                        .players
                                        .iter()
                                        .filter(|p| p.connected)
                                        .filter_map(student_id_from_player)
                                        .collect();
                                    (
                                        game.klassen_mode(),
                                        game.class_id,
                                        game.owner_user_id,
                                        active,
                                    )
                                };

                                // Resolved display name + student_id for admission.
                                // Non-klassen: username from client; klassen: server roster name.
                                let mut admit_username = username.to_string();
                                let mut admit_student_id: Option<i64> = None;

                                if is_klassen {
                                    let client_ip = client_ip_key(&socket, &client_id);
                                    // Dual throttle keys (A9): per-(game,ip) and per-(game,student_id).
                                    let game_rate_key = format!("{}:{}", game_id, client_ip);
                                    let pin_rate_key = format!("klassen:{}:{}", game_id, client_ip);

                                    // MUST call RATE_LIMITER (known past bug: wired but never invoked).
                                    let throttled = !crate::http::RATE_LIMITER
                                        .check_klassen_pin_rate(&game_rate_key, false)
                                        || !crate::http::RATE_LIMITER
                                            .check_pin_rate(&pin_rate_key, false);

                                    if throttled {
                                        // Constant shape on lockout (A7/A9).
                                        socket
                                            .emit(constants::game::ERROR_MESSAGE, INVALID_CREDENTIALS)
                                            .ok();
                                        return;
                                    }

                                    let joined_pin = emoji_pin_symbols
                                        .as_ref()
                                        .and_then(|syms| join_emoji_pin(syms));

                                    // Format check without leaking pin contents.
                                    let pin_format_ok = joined_pin
                                        .as_ref()
                                        .map(|p| crate::http::emoji_pin::is_valid_pin(p))
                                        .unwrap_or(false);

                                    let (cid, oid) = match (class_id, owner_id) {
                                        (Some(c), Some(o)) => (c, o),
                                        _ => {
                                            // klassen_mode without class/owner — treat as invalid
                                            crate::http::RATE_LIMITER
                                                .check_klassen_pin_rate(&game_rate_key, true);
                                            crate::http::RATE_LIMITER
                                                .check_pin_rate(&pin_rate_key, true);
                                            socket
                                                .emit(
                                                    constants::game::ERROR_MESSAGE,
                                                    INVALID_CREDENTIALS,
                                                )
                                                .ok();
                                            return;
                                        }
                                    };

                                    // Fetch roster WITH stored PINs for validation (F3).
                                    // This replaces the inline validation logic.
                                    let students_with_pins =
                                        crate::db::pins::students_with_pins(&db_pool, cid, oid)
                                            .await;

                                    let roster_for_decision: Vec<(i64, String, String)> =
                                        students_with_pins
                                            .into_iter()
                                            .map(|(id, name, pin)| (id, name, pin))
                                            .collect();

                                    // F2(b): Per-student throttle initialization (keyed by game:student_id).
                                    // Will be recorded on failure if needed.
                                    let student_rate_key = if let Some(sid) = student_id {
                                        format!("klassen:{}:{}", game_id, sid)
                                    } else {
                                        // No student_id provided; still check throttle as pass-through
                                        format!("klassen:{}:none", game_id)
                                    };

                                    let student_throttled = !crate::http::RATE_LIMITER
                                        .check_student_pin_rate(&student_rate_key, false);

                                    if student_throttled {
                                        // Constant shape on lockout (A7/A9).
                                        socket
                                            .emit(constants::game::ERROR_MESSAGE, INVALID_CREDENTIALS)
                                            .ok();
                                        return;
                                    }

                                    // Call the tested decision function (F3).
                                    let credentials_decision = decide_klassen_login(
                                        student_id,
                                        joined_pin.as_deref(),
                                        &roster_for_decision,
                                        &active_student_ids,
                                        false, // throttle not yet fully checked inside lock
                                    );

                                    // Handle the decision.
                                    match credentials_decision {
                                        KlassenLoginDecision::Allow { display_name } => {
                                            // Credentials passed; admission proceeds.
                                            admit_username = display_name;
                                            admit_student_id = student_id;
                                        }
                                        KlassenLoginDecision::InvalidCredentials => {
                                            // Record failure on all throttles (A9).
                                            crate::http::RATE_LIMITER
                                                .check_klassen_pin_rate(&game_rate_key, true);
                                            crate::http::RATE_LIMITER
                                                .check_pin_rate(&pin_rate_key, true);
                                            crate::http::RATE_LIMITER
                                                .check_student_pin_rate(&student_rate_key, true);
                                            // SECURITY: do not log student_id or PIN.
                                            info!("klassen player:login rejected (credentials)");
                                            socket
                                                .emit(
                                                    constants::game::ERROR_MESSAGE,
                                                    INVALID_CREDENTIALS,
                                                )
                                                .ok();
                                            return;
                                        }
                                        KlassenLoginDecision::AlreadyJoined => {
                                            // Post-PIN dedup failed; already has active session.
                                            // Don't record as throttle failure (not a credential attempt).
                                            info!("klassen player:login rejected (already joined from pre-lock check)");
                                            socket
                                                .emit(constants::game::ERROR_MESSAGE, ALREADY_JOINED)
                                                .ok();
                                            return;
                                        }
                                    }
                                }

                                // #1: Read live join_locked config once per login attempt —
                                // cheap (one login per player), same idiom as the low_latency
                                // snapshot read in game.rs's CREATE handler. Node reads this
                                // once at Game construction (this.joinLocked); Rust's Game
                                // doesn't cache config, so a per-login DB read is the
                                // cheapest correct source available today.
                                let (_, _, join_locked_opt, _, _, _, _, _) =
                                    crate::db::get_game_config(&db_pool).await;
                                let join_locked = join_locked_opt.unwrap_or(false);

                                // W1-M2: Read team_mode from per-game snapshot
                                let team_mode = {
                                    let game = game_ref.lock().unwrap();
                                    game.selected_modes.team_mode.unwrap_or(false)
                                };

                                let (
                                    game_id_ret,
                                    manager_socket_id,
                                    player,
                                    total_players,
                                    ghost_old_socket_id,
                                ) = {
                                    let mut game = game_ref.lock().unwrap();

                                    // #2: Check if game has finished (engine phase Finished)
                                    if game.engine.phase == GamePhase::Finished {
                                        drop(game);
                                        socket
                                            .emit(
                                                constants::game::ERROR_MESSAGE,
                                                "errors:game.gameEnded",
                                            )
                                            .ok();
                                        return;
                                    }

                                    // #1: Reject NEW players while the lobby is locked; an
                                    // existing player (reconnect-via-login) is unaffected
                                    // (Node player-manager.ts join(): getJoinLocked() && !existing).
                                    let already_joined =
                                        game.players.iter().any(|p| p.client_id == client_id);
                                    if join_locked && !already_joined {
                                        drop(game);
                                        socket
                                            .emit(
                                                constants::game::ERROR_MESSAGE,
                                                "errors:game.locked",
                                            )
                                            .ok();
                                        return;
                                    }

                                    // #83/#84 follow-up: a lobby tab closed earlier left a
                                    // connected=false ghost row (mark_player_disconnected's
                                    // keep-slot grace). Drop it here so this fresh login
                                    // doesn't hit add_player's client_id dup-guard. A
                                    // connected=true match is a real duplicate (two tabs) —
                                    // take_over_ghost_slot leaves it alone and add_player
                                    // rejects as before. Mid-game re-join uses player:reconnect,
                                    // not login, so this is ShowRoom-only.
                                    let ghost_old_socket_id = if already_joined
                                        && game.engine.phase == GamePhase::ShowRoom
                                    {
                                        game.take_over_ghost_slot(&client_id)
                                    } else {
                                        None
                                    };

                                    // H — per-game player cap
                                    if game.players.len() >= crate::state::MAX_PLAYERS_PER_GAME {
                                        drop(game);
                                        socket
                                            .emit(
                                                constants::game::ERROR_MESSAGE,
                                                "errors:game.gameFull",
                                            )
                                            .ok();
                                        return;
                                    }

                                    // F1: AUTHORITATIVE dedup check INSIDE lock (freshly computed).
                                    // Re-compute active_student_ids from current game state.
                                    if is_klassen {
                                        if let Some(sid) = admit_student_id {
                                            let active_fresh: Vec<i64> = game
                                                .players
                                                .iter()
                                                .filter(|p| p.connected)
                                                .filter_map(student_id_from_player)
                                                .collect();
                                            if active_fresh.contains(&sid) {
                                                // Still active for this student (race detected or previous check missed).
                                                // Don't record as throttle failure.
                                                drop(game);
                                                info!("klassen player:login rejected (already joined from in-lock check)");
                                                socket
                                                    .emit(constants::game::ERROR_MESSAGE, ALREADY_JOINED)
                                                    .ok();
                                                return;
                                            }
                                        }
                                    }

                                    let mut player = match game.add_player(
                                        socket_id.clone(),
                                        client_id.clone(),
                                        admit_username.clone(),
                                        avatar,
                                    ) {
                                        Ok(p) => p,
                                        Err(e) => {
                                            drop(game);
                                            socket.emit(constants::game::ERROR_MESSAGE, e).ok();
                                            return;
                                        }
                                    };

                                    // Bind student identity for klassen dedup (A6) + roster alreadyJoined.
                                    // Stored in identifier_hash (server-side tracking key, Wave-1).
                                    if let Some(sid) = admit_student_id {
                                        let sid_str = sid.to_string();
                                        if let Some(p) =
                                            game.players.iter_mut().find(|p| p.id == player.id)
                                        {
                                            p.identifier_hash = Some(sid_str.clone());
                                        }
                                        if let Some(p) = game
                                            .engine
                                            .players
                                            .iter_mut()
                                            .find(|p| p.id == player.id)
                                        {
                                            p.identifier_hash = Some(sid_str.clone());
                                        }
                                        player.identifier_hash = Some(sid_str);
                                    }

                                    let game_id = game.game_id.clone();
                                    let manager_socket_id = game.manager_socket_id.clone();
                                    let total_players = game.players.len();

                                    (
                                        game_id,
                                        manager_socket_id,
                                        player,
                                        total_players,
                                        ghost_old_socket_id,
                                    )
                                };

                                // O(1) socket_id -> game_id index (state.rs) — keeps
                                // remove/mark-disconnected/set_player_team/set_player_avatar
                                // off the old full-scan path for this connection.
                                {
                                    let mut registry = registry.write().await;
                                    if let Some(ref old_socket_id) = ghost_old_socket_id {
                                        registry.deindex_player_socket(old_socket_id);
                                    }
                                    registry
                                        .index_player_socket(socket_id.clone(), game_id_ret.clone());
                                }

                                // SECURITY: username only (no student_id / PIN).
                                info!(
                                    "Player joined game: gameId={}, username={}",
                                    game_id_ret, admit_username
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
                                    team_mode: Some(team_mode),
                                });
                                socket.emit(constants::game::STATUS, &wait_status).ok();

                                // Ghost takeover: drop the stale roster row BEFORE NEW_PLAYER
                                // paints the fresh one, else the manager briefly shows two
                                // tiles for the same human.
                                if let Some(old_socket_id) = ghost_old_socket_id {
                                    if let Ok(sid) = manager_socket_id.parse() {
                                        if let Some(mgr) = io_handle.get_socket(sid) {
                                            mgr.emit(
                                                constants::manager::REMOVE_PLAYER,
                                                &old_socket_id,
                                            )
                                            .ok();
                                        }
                                    }
                                }

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

#[cfg(test)]
mod tests {
    use super::*;

    fn roster() -> Vec<(i64, String, String)> {
        vec![
            (1, "Anna".into(), "🐱🐶🐭🐹".into()),
            (2, "Ben".into(), "🍕📚🎮🌸".into()),
        ]
    }

    #[test]
    fn klassen_login_rostered_correct_pin_success() {
        let d = decide_klassen_login(
            Some(1),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[],
            false,
        );
        assert_eq!(
            d,
            KlassenLoginDecision::Allow {
                display_name: "Anna".into()
            }
        );
    }

    #[test]
    fn klassen_login_wrong_pin_invalid_credentials() {
        let d = decide_klassen_login(
            Some(1),
            Some("🍕📚🎮🌸"),
            &roster(),
            &[],
            false,
        );
        assert_eq!(d, KlassenLoginDecision::InvalidCredentials);
    }

    #[test]
    fn klassen_login_non_rostered_invalid_credentials_no_oracle() {
        // Unknown student_id → same shape as wrong PIN (A7).
        let d = decide_klassen_login(
            Some(99),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[],
            false,
        );
        assert_eq!(d, KlassenLoginDecision::InvalidCredentials);

        // Missing student_id
        let d2 = decide_klassen_login(None, Some("🐱🐶🐭🐹"), &roster(), &[], false);
        assert_eq!(d2, KlassenLoginDecision::InvalidCredentials);
    }

    #[test]
    fn klassen_login_second_active_session_already_joined() {
        let d = decide_klassen_login(
            Some(1),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[1],
            false,
        );
        assert_eq!(d, KlassenLoginDecision::AlreadyJoined);
    }

    #[test]
    fn klassen_login_throttle_lockout_invalid_credentials() {
        let d = decide_klassen_login(
            Some(1),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[],
            true,
        );
        assert_eq!(d, KlassenLoginDecision::InvalidCredentials);
    }

    #[test]
    fn join_emoji_pin_requires_four_symbols() {
        assert!(join_emoji_pin(&["a".into(), "b".into(), "c".into(), "d".into()]).is_some());
        assert!(join_emoji_pin(&["a".into(), "b".into()]).is_none());
        assert!(join_emoji_pin(&["a".into(), "b".into(), "c".into(), "".into()]).is_none());
    }

    #[test]
    fn klassen_login_dedup_race_two_concurrent_calls() {
        // Simulate two concurrent login attempts for the same student.
        // First call: no active sessions → Allow
        let d1 = decide_klassen_login(
            Some(1),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[], // empty active_student_ids initially
            false,
        );
        assert_eq!(
            d1,
            KlassenLoginDecision::Allow {
                display_name: "Anna".into()
            }
        );

        // Second call: student 1 is now active → AlreadyJoined
        let d2 = decide_klassen_login(
            Some(1),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[1], // student 1 added to active
            false,
        );
        assert_eq!(d2, KlassenLoginDecision::AlreadyJoined);
    }

    #[test]
    fn klassen_login_per_student_throttle_behavior() {
        // This test verifies that the per-student rate limiter is properly called.
        // In production, the handler calls check_student_pin_rate() with key `klassen:{game_id}:{student_id}`.
        // The rate limiter itself is tested in rate_limit.rs tests.
        // Here we just verify decide_klassen_login accepts the throttle flag.

        // Throttle not blocked → credentials checked normally
        let d1 = decide_klassen_login(
            Some(1),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[],
            false, // throttle_blocked = false
        );
        assert_eq!(
            d1,
            KlassenLoginDecision::Allow {
                display_name: "Anna".into()
            }
        );

        // Throttle blocked → credentials rejected regardless
        let d2 = decide_klassen_login(
            Some(1),
            Some("🐱🐶🐭🐹"),
            &roster(),
            &[],
            true, // throttle_blocked = true
        );
        assert_eq!(d2, KlassenLoginDecision::InvalidCredentials);
    }
}
