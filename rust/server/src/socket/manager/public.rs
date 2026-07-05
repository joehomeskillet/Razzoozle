//! MANAGER.GET_THEME, SUBMIT_QUESTION — public/unauthenticated handlers

use super::super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;

pub fn register(socket: &SocketRef, _ctx: HandlerCtx) {
    register_get_theme(socket, _ctx.clone());
    register_submit_question(socket, _ctx.clone());
}

fn register_get_theme(socket: &SocketRef, _ctx: HandlerCtx) {
    socket.on(constants::manager::GET_THEME, {
        move |socket: SocketRef| {
            let theme_path = "config/theme/theme.json";

            let theme = if let Ok(contents) = fs::read_to_string(theme_path) {
                serde_json::from_str::<serde_json::Value>(&contents).ok()
            } else {
                None
            };

            let payload = theme.unwrap_or_else(|| serde_json::json!({}));
            socket.emit(constants::manager::THEME, &payload).ok();
        }
    });
}

fn register_submit_question(socket: &SocketRef, _ctx: HandlerCtx) {
    socket.on(constants::manager::SUBMIT_QUESTION, {
        move |socket: SocketRef, Data::<serde_json::Value>(_payload)| {
            // For now, just acknowledge the submission
            // Real validation happens in the Node.js layer
            socket.emit(constants::manager::SUBMIT_SUCCESS, &serde_json::json!({})).ok();
        }
    });
}
