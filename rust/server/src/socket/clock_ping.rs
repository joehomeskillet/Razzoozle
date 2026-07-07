//! CLOCK.PING — reply with the current server wall-clock time (low-latency clock sync).
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::clock::PING, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data(data): Data<serde_json::Value>| {
            // Extract clientSendMonoMs from client; if missing or invalid, drop silently (node-parity).
            let client_send_mono_ms = match data.get("clientSendMonoMs").and_then(|v| v.as_f64()) {
                Some(ms) => ms,
                None => return,
            };

            // Spawn async task to resolve game and gate PONG on low_latency config.
            tokio::spawn(async move {
                // Gate 1: Resolve the caller's game by socket membership (player or manager).
                let game_ref = {
                    let registry = ctx.registry.read().await;
                    registry.get_game_by_socket_id(socket.id.to_string().as_str())
                };

                let game_ref = match game_ref {
                    Some(g) => g,
                    None => return, // Socket not in any game, no PONG
                };

                // Gate 2: Check if this game has low-latency enabled.
                let low_latency_enabled = match game_ref.lock() {
                    Ok(game) => game.low_latency,
                    Err(_) => return, // Lock failed, drop silently
                };

                if !low_latency_enabled {
                    return; // low_latency not enabled, no PONG
                }

                // TODO(parity): also gate on lowLatency.clockSync once cached in-memory
                // (Node's handleClockPing checks both enabled AND clockSync before sending PONG).

                let server_now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);

                // Echo clientSendMonoMs and send serverNowMs for low-latency clock sync.
                socket
                    .emit(
                        constants::clock::PONG,
                        &serde_json::json!({
                            "clientSendMonoMs": client_send_mono_ms,
                            "serverNowMs": server_now_ms,
                        }),
                    )
                    .ok();
            });
        }
    });
}
