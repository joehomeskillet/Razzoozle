//! MANAGER.GET_THEME, SUBMIT_QUESTION — public/unauthenticated handlers

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_get_theme(socket, ctx.clone());
    register_submit_question(socket, ctx);
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

fn register_submit_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SUBMIT_QUESTION, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Minimal validation (the submit UI already validates the full shape):
                // require a non-empty submittedBy and a question object with text.
                let submitted_by = payload
                    .get("submittedBy")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let question = payload
                    .get("question")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                let q_text = question
                    .get("question")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();

                if submitted_by.is_empty() || q_text.is_empty() || !question.is_object() {
                    socket
                        .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalid")
                        .ok();
                    return;
                }

                // Flood cap on the public, unauthenticated endpoint (mirrors Node's
                // PENDING_QUEUE_CAP). Fail-open on a count error so a DB hiccup does
                // not lock out legitimate submitters.
                if db::count_pending_submissions(&ctx.db_pool).await >= 200 {
                    socket
                        .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.queueFull")
                        .ok();
                    return;
                }

                let id = slug_id(&q_text);

                match db::insert_submission(&ctx.db_pool, &id, &submitted_by, &question).await {
                    Ok(()) => {
                        socket
                            .emit(constants::manager::SUBMIT_SUCCESS, &serde_json::json!({}))
                            .ok();
                    }
                    Err(_) => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.saveFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

/// Slug a question text into a `safe_id` (`^[A-Za-z0-9_-]+`), mirroring Node's
/// slug-id save so a re-submitted identical question upserts instead of
/// duplicating. Falls back to a uuid when the text has no alphanumerics.
fn slug_id(text: &str) -> String {
    let mut s = String::new();
    let mut last_dash = false;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            s.push(c.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            s.push('-');
            last_dash = true;
        }
    }
    let trimmed: String = s.trim_matches('-').chars().take(80).collect();
    let trimmed = trimmed.trim_matches('-').to_string();
    if trimmed.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        trimmed
    }
}
