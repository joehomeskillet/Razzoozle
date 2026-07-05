//! CLOCK.PING — reply with the current server wall-clock time (low-latency clock sync).
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn register(socket: &SocketRef, _ctx: HandlerCtx) {
    socket.on(constants::clock::PING, {
        move |socket: SocketRef, _data: Data<serde_json::Value>| {
            let server_now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            socket
                .emit(constants::clock::PONG, &serde_json::json!({ "serverNowMs": server_now_ms }))
                .ok();
        }
    });
}
