//! LOGOUT, RECONNECT — manager session handlers
//!
//! Reconnect accepts DB-session auth (host) **or** a valid satellite handshake
//! token (display kiosk). Satellite joins are display-only: they enter
//! `display:{gameId}` for `game:experience` and never steal `manager_socket_id`.

use super::super::HandlerCtx;
use crate::socket::auth;
use crate::socket::status_emit;
use crate::state::socket_role;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use tracing::warn;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_logout(socket, ctx.clone());
    register_reconnect(socket, ctx.clone());
}

fn register_logout(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::LOGOUT, {
        let ctx = ctx.clone();

        move |_socket: SocketRef, _data: Data<serde_json::Value>| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate: require valid session
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => return,
                };

                // X2a: revoke ONLY this session's row — other concurrent sessions
                // for the same user (e.g. a second device) stay valid.
                if let (Some(ref pool), Some(ref token)) = (&ctx.db_pool, &ctx.session_token) {
                    let _ = crate::db::users::delete_session(pool, token).await;
                }

                // Also clear the in-connection cache so this socket stops being
                // treated as authenticated for any further calls before it
                // disconnects (require_user() would otherwise keep returning
                // the cached user even after the DB row is gone).
                let mut cache = ctx.user_cache.write().await;
                *cache = None;
            });
        }
    });
}

/// WP #959 — reconnect may proceed when either a session user or a valid
/// satellite token is present. Pure session-less sockets are denied.
pub(crate) fn reconnect_auth_allowed(has_user: bool, satellite_ok: bool) -> bool {
    has_user || satellite_ok
}

/// WP #959 — whether this reconnect should claim the single `manager_socket_id`.
///
/// - Satellite kiosks never claim (display-only; phone stays controller).
/// - Host claims when the previous manager socket is free or is this socket.
/// - Host with another live manager socket joins display-only (no hard RESET)
///   so a second tab / satellite SPA can still receive `game:experience`.
pub(crate) fn reconnect_claims_manager(
    satellite_ok: bool,
    same_socket: bool,
    previous_manager_alive: bool,
) -> bool {
    if satellite_ok {
        return false;
    }
    same_socket || !previous_manager_alive
}

fn register_reconnect(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RECONNECT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // WP #959 — session host OR satellite token (handshake).
                // Previously require_user-only silently blocked pure kiosks
                // before they could join display:{gameId} / get the envelope.
                let user = ctx.require_user().await;
                let satellite_ok = auth::can_authorize_display_event(&ctx);
                if !reconnect_auth_allowed(user.is_some(), satellite_ok) {
                    warn!(
                        "manager:unauthorized event=reconnect check=require_user_or_satellite socketId={} satellite={}",
                        socket.id, satellite_ok
                    );
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                // Claim Manager role only for host path — observe only.
                // Satellite stays display-side (VerifiedRole may already be unset).
                let socket_id = socket.id.to_string();
                if !satellite_ok {
                    if let Err(held_role) =
                        socket_role::try_claim(&socket_id, socket_role::VerifiedRole::Manager)
                    {
                        tracing::warn!(
                            "manager role conflict: socketId={} held_role={:?} requested=Manager",
                            socket_id, held_role
                        );
                    }
                }

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

                // Ownership: satellite token is a shared display secret (any game).
                // Host path still needs is_game_host (user-id / admin / hostToken).
                if !satellite_ok {
                    let is_owner = {
                        let game = game_ref.lock().unwrap();
                        crate::is_game_host(&game, &payload, &ctx.client_id, user.as_ref())
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
                }

                let new_socket_id = socket.id.to_string();

                let previous_socket_id = {
                    let game = game_ref.lock().unwrap();
                    game.manager_socket_id.clone()
                };

                let same_socket = previous_socket_id == new_socket_id;
                let previous_manager_alive = if same_socket {
                    false
                } else if let Ok(sid) = previous_socket_id.parse() {
                    ctx.io.get_socket(sid).is_some()
                } else {
                    false
                };

                let claim_manager =
                    reconnect_claims_manager(satellite_ok, same_socket, previous_manager_alive);

                // Pre-#959 host dual-tab got hard RESET managerAlreadyConnected and
                // never joined display:{gameId} — so no live experience + no 939B
                // resend. Satellite and non-claiming host now fall through to the
                // display-room join + envelope resend below.
                if !claim_manager && !satellite_ok && previous_manager_alive {
                    // Host second view: do not steal the manager slot; still join
                    // display rooms so the garden envelope reaches this socket.
                    tracing::info!(
                        "manager:reconnect display-only join (manager slot held) gameId={} socketId={}",
                        game_id, new_socket_id
                    );
                }

                let (game_id, players, current_question_index, total_questions, reconnect_status) = {
                    let mut game = game_ref.lock().unwrap();
                    if claim_manager {
                        game.manager_socket_id = new_socket_id;
                    }
                    let reconnect_status = game.manager_reconnect_status();
                    (
                        game.game_id.clone(),
                        game.players.clone(),
                        game.engine.current_question_index,
                        game.engine.quiz.questions.len(),
                        reconnect_status,
                    )
                };

                // socketioxide does NOT auto-join rooms. Join the game room now;
                // status_emit atomically joins display:{id} with its reconnect
                // replay below so no live experience transition can slip between
                // display-room membership and snapshot delivery.
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

                // WP #939B / #959 — hard-reload / satellite join left the socket
                // with no game:experience snapshot (transitions only fire on
                // status changes). Resend current FlowerBattle envelope to THIS
                // socket only; revision is not bumped (idempotent).
                status_emit::join_display_and_resend_experience_on_reconnect(
                    &socket, &game_ref,
                );
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconnect_auth_requires_user_or_satellite() {
        assert!(!reconnect_auth_allowed(false, false));
        assert!(reconnect_auth_allowed(true, false));
        assert!(reconnect_auth_allowed(false, true));
        assert!(reconnect_auth_allowed(true, true));
    }

    /// WP #959 — satellite never steals the manager slot (phone stays controller).
    #[test]
    fn satellite_never_claims_manager_slot() {
        assert!(!reconnect_claims_manager(true, false, true));
        assert!(!reconnect_claims_manager(true, true, false));
        assert!(!reconnect_claims_manager(true, false, false));
    }

    /// Host claims when free or same socket; dual-tab host does not claim.
    #[test]
    fn host_claims_only_when_slot_free_or_same_socket() {
        assert!(reconnect_claims_manager(false, true, false)); // same socket
        assert!(reconnect_claims_manager(false, false, false)); // free
        assert!(!reconnect_claims_manager(false, false, true)); // other alive → display-only
    }

    /// Regression: the pre-#959 path hard-RESET on dual manager and skipped
    /// display-room join + envelope resend. Display-only is the intended
    /// fallback whenever claim is false (satellite or dual host view).
    #[test]
    fn display_only_path_covers_satellite_and_dual_host() {
        let satellite_display_only = !reconnect_claims_manager(true, false, true);
        let dual_host_display_only = !reconnect_claims_manager(false, false, true);
        assert!(satellite_display_only);
        assert!(dual_host_display_only);
        // Auth still required before that path is reachable.
        assert!(reconnect_auth_allowed(false, true));
        assert!(reconnect_auth_allowed(true, false));
    }
}
