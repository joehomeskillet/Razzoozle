//! MANAGER.SET_THEME — theme management handler
//! manager:setTheme — persist the theme to disk (the same file
//! MANAGER.GET_THEME reads, so the round-trip stays consistent), also mirror
//! it to the DB, then broadcast to all clients.

mod apply;
mod skeleton;
mod uploads;
mod validate;

pub use apply::apply_theme;
pub use validate::validate_theme;

use apply::register_set_theme;
use skeleton::{register_reset_skeleton, register_set_skeleton_asset};
use uploads::{register_upload_background, register_upload_sound};

use super::super::HandlerCtx;
use super::public;
use razzoozle_protocol::theme::ThemeRevision;
use socketioxide::extract::SocketRef;

/// Simple base64 decoder (no external dependency)
pub(crate) fn decode_base64(s: &str) -> Result<Vec<u8>, String> {
    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for &byte in s.as_bytes() {
        let val = if byte == b'=' {
            break;
        } else if let Some(pos) = BASE64_CHARS.iter().position(|&b| b == byte) {
            pos as u32
        } else if byte.is_ascii_whitespace() {
            continue;
        } else {
            return Err("Invalid base64 character".to_string());
        };

        buf = (buf << 6) | val;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            result.push(((buf >> bits) & 0xff) as u8);
        }
    }

    Ok(result)
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_set_theme(socket, ctx.clone());
    register_set_skeleton_asset(socket, ctx.clone());
    register_reset_skeleton(socket, ctx.clone());
    register_upload_background(socket, ctx.clone());
    register_upload_sound(socket, ctx.clone());
}

