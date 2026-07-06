//! MANAGER.LIST_SUBMISSIONS — full submissions (with question OBJECTS) for the
//! Suggestions moderation/preview panel.
//!
//! Distinct from `manager:config`'s `submissions` field, which carries lightweight
//! `SubmissionMeta` (question is a preview STRING). The Suggestions preview needs
//! the FULL question object, delivered here via `manager:submissionsData`.

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::SocketRef;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    // No-payload event: signature is `move |socket: SocketRef|` (a `Data` extractor
    // on a no-arg emit silently blocks invocation in socketioxide).
    socket.on(constants::manager::LIST_SUBMISSIONS, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                let subs = db::get_submissions_full(&ctx.db_pool).await;
                socket
                    .emit(constants::manager::SUBMISSIONS_DATA, &subs)
                    .ok();
            });
        }
    });
}
