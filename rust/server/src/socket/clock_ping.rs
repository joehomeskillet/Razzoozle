//! CLOCK.PING — reply with the current server wall-clock time (low-latency clock sync).
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn register(socket: &SocketRef, _ctx: HandlerCtx) {
    socket.on(constants::clock::PING, {
        move |socket: SocketRef, Data(data): Data<serde_json::Value>| {
            // Extract clientSendMonoMs from client; if missing or invalid, drop silently (node-parity).
            let client_send_mono_ms = match data.get("clientSendMonoMs").and_then(|v| v.as_f64()) {
                Some(ms) => ms,
                None => return,
            };

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
        }
    });
}
