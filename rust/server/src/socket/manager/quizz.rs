//! QUIZZ.GET — load one quiz's full detail for the manager editor.
//!
//! The manager quiz-editor page (`/manager/quizz/:id`) emits `quizz:get` with a
//! BARE STRING id and awaits `quizz:data` carrying the full `QuizzWithId`
//! (`{id, subject, questions, archived, themeId}`). The editor renders a spinner
//! until it receives a payload whose `id === quizzId`, so the `id` MUST be echoed
//! back. Without this handler the editor spins forever.

use super::super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::quizz::GET, {
        let ctx = ctx.clone();

        // Client emits a bare string id (Node handler: `(id) => ...`), so the
        // extractor is `Data::<String>`, NOT `Data::<Value>` on an `{id}` object.
        move |socket: SocketRef, Data::<String>(id)| {
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

                let registry = ctx.registry.read().await;
                match registry.get_quiz_by_id(&id) {
                    Some(quiz) => {
                        let payload = serde_json::json!({
                            "id": id,
                            "subject": quiz.subject,
                            "questions": quiz.questions,
                            "archived": quiz.archived,
                            "themeId": quiz.theme_id,
                        });
                        socket.emit(constants::quizz::DATA, &payload).ok();
                    }
                    None => {
                        socket
                            .emit(constants::quizz::ERROR, "errors:quizz.notFound")
                            .ok();
                    }
                }
            });
        }
    });
}
