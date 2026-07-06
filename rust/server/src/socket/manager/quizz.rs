//! QUIZZ handlers — load, save, delete, duplicate, and archive quiz operations
//!
//! quizz:get — read one quiz for the manager editor (auth-gated)
//! quizz:save — create/update a quiz (auth-gated, upserts to DB, reloads registry)
//! quizz:delete — remove a quiz from DB (auth-gated)
//! quizz:duplicate — copy quiz with new id + "(Kopie)" suffix
//! quizz:setArchived — toggle archived flag

use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use crate::state::safe_asset_id;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

/// Normalize a string to a safe ID slug: lowercase, replace spaces with hyphens,
/// remove non-alphanumeric except hyphens. Matches Node's normalizeFilename behavior.
fn normalize_filename(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c == ' ' {
                '-'
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|seg| !seg.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_get(socket, ctx.clone());
    register_save(socket, ctx.clone());
    register_update(socket, ctx.clone());
    register_delete(socket, ctx.clone());
    register_duplicate(socket, ctx.clone());
    register_set_archived(socket, ctx.clone());
}

fn register_get(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::quizz::GET, {
        let ctx = ctx.clone();

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

fn register_save(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::quizz::SAVE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
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

                // Validate the quizz payload: {subject: string, questions: Question[]}
                let subject = payload.get("subject").and_then(|v| v.as_str());
                let questions = payload.get("questions").and_then(|v| v.as_array());

                match (subject, questions) {
                    (Some(subj), Some(qs)) if !subj.is_empty() && subj.len() <= 100 && !qs.is_empty() => {
                        // Generate id from subject via normalize_filename
                        let id = normalize_filename(subj);

                        // Validate the id is safe
                        if let Err(e) = safe_asset_id(&id) {
                            socket.emit(constants::quizz::ERROR, &e).ok();
                            return;
                        }

                        let questions_json = payload.get("questions").cloned().unwrap_or(serde_json::json!([]));

                        match db::upsert_quiz(&ctx.db_pool, &id, subj, questions_json).await {
                            Ok(_quiz_id) => {
                                // Reload registry from DB
                                {
                                    let quizzes = db::get_quizzes(&ctx.db_pool).await;
                                    let mut registry = ctx.registry.write().await;
                                    registry.reload_quizzes(quizzes);
                                }

                                let response = serde_json::json!({ "id": id });
                                socket.emit(constants::quizz::SAVE_SUCCESS, &response).ok();
                                config_helper::build_and_emit_config(&socket, &ctx).await;
                            }
                            Err(e) => {
                                socket.emit(constants::quizz::ERROR, &e).ok();
                            }
                        }
                    }
                    _ => {
                        socket.emit(constants::quizz::ERROR, "errors:quizz.invalidPayload").ok();
                    }
                }
            });
        }
    });
}

fn register_update(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::quizz::UPDATE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
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

                // Update an existing quiz in place: {id, subject, questions[]}.
                // Keeps the SAME id (matches Node updateQuizz, which returns the input id).
                let id = payload.get("id").and_then(|v| v.as_str());
                let subject = payload.get("subject").and_then(|v| v.as_str());
                let questions = payload.get("questions").and_then(|v| v.as_array());

                match (id, subject, questions) {
                    (Some(quiz_id), Some(subj), Some(qs))
                        if !quiz_id.is_empty() && !subj.is_empty() && subj.len() <= 100 && !qs.is_empty() =>
                    {
                        if let Err(e) = safe_asset_id(quiz_id) {
                            socket.emit(constants::quizz::ERROR, &e).ok();
                            return;
                        }

                        let questions_json = payload.get("questions").cloned().unwrap_or(serde_json::json!([]));

                        match db::upsert_quiz(&ctx.db_pool, quiz_id, subj, questions_json).await {
                            Ok(_quiz_id) => {
                                // Reload registry from DB so a live game uses the edited quiz
                                {
                                    let quizzes = db::get_quizzes(&ctx.db_pool).await;
                                    let mut registry = ctx.registry.write().await;
                                    registry.reload_quizzes(quizzes);
                                }

                                let response = serde_json::json!({ "id": quiz_id });
                                socket.emit(constants::quizz::UPDATE_SUCCESS, &response).ok();
                                config_helper::build_and_emit_config(&socket, &ctx).await;
                            }
                            Err(e) => {
                                socket.emit(constants::quizz::ERROR, &e).ok();
                            }
                        }
                    }
                    _ => {
                        socket.emit(constants::quizz::ERROR, "errors:quizz.invalidPayload").ok();
                    }
                }
            });
        }
    });
}

fn register_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::quizz::DELETE, {
        let ctx = ctx.clone();

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

                if let Err(e) = safe_asset_id(&id) {
                    socket.emit(constants::quizz::ERROR, &e).ok();
                    return;
                }

                match db::delete_quiz(&ctx.db_pool, &id).await {
                    Ok(_) => {
                        // Reload registry from DB
                        {
                            let quizzes = db::get_quizzes(&ctx.db_pool).await;
                            let mut registry = ctx.registry.write().await;
                            registry.reload_quizzes(quizzes);
                        }

                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Err(e) => {
                        socket.emit(constants::quizz::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}

fn register_duplicate(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::quizz::DUPLICATE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<String>(source_id)| {
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

                // Read source quiz from registry
                let source_quiz = {
                    let registry = ctx.registry.read().await;
                    registry.get_quiz_by_id(&source_id)
                };

                match source_quiz {
                    Some(quiz) => {
                        let new_subject = format!("{} (Kopie)", quiz.subject);
                        let new_id = normalize_filename(&new_subject);

                        // Validate the new id is safe
                        if let Err(e) = safe_asset_id(&new_id) {
                            socket.emit(constants::quizz::ERROR, &e).ok();
                            return;
                        }

                        match db::duplicate_quiz(&ctx.db_pool, &source_id, &new_id, &new_subject).await {
                            Ok(_) => {
                                // Reload registry from DB
                                {
                                    let quizzes = db::get_quizzes(&ctx.db_pool).await;
                                    let mut registry = ctx.registry.write().await;
                                    registry.reload_quizzes(quizzes);
                                }

                                config_helper::build_and_emit_config(&socket, &ctx).await;
                            }
                            Err(e) => {
                                socket.emit(constants::quizz::ERROR, &e).ok();
                            }
                        }
                    }
                    None => {
                        socket.emit(constants::quizz::ERROR, "errors:quizz.notFound").ok();
                    }
                }
            });
        }
    });
}

fn register_set_archived(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::quizz::SET_ARCHIVED, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
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

                // Parse payload {id, archived}
                let id = payload.get("id").and_then(|v| v.as_str());
                let archived = payload.get("archived").and_then(|v| v.as_bool());

                match (id, archived) {
                    (Some(id_str), Some(arch)) => {
                        if let Err(e) = safe_asset_id(id_str) {
                            socket.emit(constants::quizz::ERROR, &e).ok();
                            return;
                        }

                        match db::update_quiz_archived(&ctx.db_pool, id_str, arch).await {
                            Ok(_) => {
                                // Reload registry from DB
                                {
                                    let quizzes = db::get_quizzes(&ctx.db_pool).await;
                                    let mut registry = ctx.registry.write().await;
                                    registry.reload_quizzes(quizzes);
                                }

                                config_helper::build_and_emit_config(&socket, &ctx).await;
                            }
                            Err(e) => {
                                socket.emit(constants::quizz::ERROR, &e).ok();
                            }
                        }
                    }
                    _ => {
                        socket.emit(constants::quizz::ERROR, "errors:quizz.invalidPayload").ok();
                    }
                }
            });
        }
    });
}
