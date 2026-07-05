//! METRICS.REPORT / METRICS.SUBSCRIBE — low-latency metrics intake (minimal: accept + ack).
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, _ctx: HandlerCtx) {
    socket.on(constants::metrics::REPORT, {
        move |_socket: SocketRef, _data: Data<serde_json::Value>| {
            // Metrics are currently a no-op in the basic implementation.
        }
    });

    socket.on(constants::metrics::SUBSCRIBE, {
        move |socket: SocketRef, _data: Data<serde_json::Value>| {
            socket
                .emit(constants::metrics::HEALTH, &serde_json::json!({ "status": "ok" }))
                .ok();
        }
    });
}
