//! DISPLAY.REGISTER / PAIR / PING / DISCONNECT — pairing and management of display sockets.
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    // Handle DISPLAY.REGISTER — register a display and get a pairing code
    socket.on(constants::display::REGISTER, {
        move |socket: SocketRef, _data: Data::<serde_json::Value>| {
            // Generate 6-char alphanumeric code
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let charset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
            let code: String = (0..6)
                .map(|_| {
                    let idx = rng.gen_range(0..charset.len());
                    charset.chars().nth(idx).unwrap()
                })
                .collect();

            socket.emit(constants::display::REGISTERED, &serde_json::json!({ "code": code })).ok();
        }
    });

    // Handle DISPLAY.PAIR — pair display to game by code
    socket.on(constants::display::PAIR, {
        let io_handle = ctx.io.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let io_handle = io_handle.clone();

            let code_opt = payload.get("code").and_then(|v| v.as_str());
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

            if let (Some(code), Some(game_id)) = (code_opt, game_id_opt) {
                let game_id = game_id.to_string();

                // Verify the code exists (in a real implementation, check a pairing registry)
                // For now, accept any non-empty code
                if !code.is_empty() {
                    // Join the display socket to the game room
                    socket.join(game_id.clone());

                    // Emit PAIR_SUCCESS to both
                    socket.emit(constants::display::PAIR_SUCCESS, &serde_json::json!({ "gameId": game_id.clone() })).ok();
                    io_handle.to(game_id).emit(constants::display::PAIR_SUCCESS, &serde_json::json!({ "code": code })).ok();
                } else {
                    socket.emit(constants::display::PAIR_ERROR, "errors:display.invalidCode").ok();
                }
            }
        }
    });

    // Handle DISPLAY.PING — heartbeat from paired display
    socket.on(constants::display::PING, {
        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let _game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
            // Update heartbeat and broadcast status
            // For now, just acknowledge
        }
    });

    // Handle DISPLAY.DISCONNECT — unregister pairing code
    socket.on(constants::display::DISCONNECT, {
        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let _code_opt = payload.get("code").and_then(|v| v.as_str());
            // Remove code from pairing registry
            // For now, no-op
        }
    });
}
