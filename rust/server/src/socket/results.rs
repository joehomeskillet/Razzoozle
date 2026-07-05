//! RESULTS.GET_SHARED — read shared results by ID (public, no auth)
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;

pub fn register(socket: &SocketRef, _ctx: HandlerCtx) {
    socket.on(constants::results::GET_SHARED, {
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let id_opt = payload.get("id").and_then(|v| v.as_str());

            if let Some(id) = id_opt {
                // Path-traversal guard: reject ids with `/`, `\`, `..` etc. before building a
                // filesystem path from client input (allowlist ^[A-Za-z0-9_-]+ via safe_asset_id).
                if crate::state::safe_asset_id(id).is_err() {
                    return;
                }

                // Try config/solo-results first, then config/results
                let result_path = format!("config/solo-results/{}.json", id);
                let contents = fs::read_to_string(&result_path)
                    .or_else(|_| fs::read_to_string(&format!("config/results/{}.json", id)));

                if let Ok(contents) = contents {
                    if let Ok(mut result) = serde_json::from_str::<serde_json::Value>(&contents) {
                        // Remove questions field for security
                        if let serde_json::Value::Object(ref mut obj) = result {
                            obj.remove("questions");
                        }
                        socket.emit(constants::results::SHARED_DATA, &result).ok();
                    }
                }
            }
        }
    });
}
