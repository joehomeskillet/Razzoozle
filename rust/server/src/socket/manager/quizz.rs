//! QUIZZ handlers — load, save, delete, duplicate, and archive quiz operations
//!
//! quizz:get — read one quiz for the manager editor (auth-gated)
//! quizz:save — create/update a quiz (auth-gated, upserts to DB, reloads registry)
//! quizz:delete — remove a quiz from DB (auth-gated)
//! quizz:duplicate — copy quiz with new id + "(Kopie)" suffix
//! quizz:setArchived — toggle archived flag

use super::super::validation;
use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use crate::state::safe_asset_id;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use uuid::Uuid;

/// Normalize a string to a safe ID slug: lowercase, replace spaces with hyphens,
/// remove non-alphanumeric except hyphens, and append a random 8-character suffix.
/// Matches Node's normalizeFilename behavior (packages/socket/src/utils/game.ts:43-56).
fn normalize_filename(s: &str) -> String {
    let slug = s
        .to_lowercase()
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
        .chars()
        .take(10)
        .collect::<String>();

    let short_id = Uuid::new_v4()
        .to_string()
        .chars()
        .take(8)
        .collect::<String>();

    format!("{}-{}", slug, short_id)
}

/// Validate each question in a questions array with full `validate_question` parity.
/// Emits the specific i18n key from the first failing question.
fn validate_questions(questions_json: &serde_json::Value) -> Result<(), &'static str> {
    let arr = questions_json
        .as_array()
        .ok_or("errors:quizz.invalidPayload")?;
    if arr.is_empty() {
        return Err("errors:quizz.noQuestions");
    }
    for q in arr {
        validation::validate_question(q)?;
    }
    Ok(())
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
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                let registry = ctx.registry.read().await;
                match registry.get_quiz_by_id(&id) {
                    Some(quiz) => {
                        // themeId/archived only present when Some (not null) — Node parity
                        let mut payload = serde_json::json!({
                            "id": id,
                            "subject": quiz.subject,
                            "questions": quiz.questions,
                        });
                        if let Some(obj) = payload.as_object_mut() {
                            if let Some(archived) = quiz.archived {
                                obj.insert("archived".to_string(), serde_json::json!(archived));
                            }
                            if let Some(theme_id) = quiz.theme_id {
                                obj.insert("themeId".to_string(), serde_json::json!(theme_id));
                            }
                        }
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
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                // Validate the quizz payload: {subject: string, questions: Question[]}
                let subject = payload.get("subject").and_then(|v| v.as_str());
                let questions = payload.get("questions").and_then(|v| v.as_array());
                let theme_id = payload.get("themeId").and_then(|v| v.as_str());

                match (subject, questions) {
                    (Some(subj), Some(qs)) if !subj.is_empty() && !qs.is_empty() => {
                        let questions_json = payload.get("questions").cloned().unwrap_or(serde_json::json!([]));

                        // Validate each question with full questionValidator
                        if let Err(e) = validate_questions(&questions_json) {
                            socket.emit(constants::quizz::ERROR, e).ok();
                            return;
                        }

                        // Generate id from subject via normalize_filename
                        let id = normalize_filename(subj);

                        // Validate the id is safe
                        if let Err(e) = safe_asset_id(&id) {
                            socket.emit(constants::quizz::ERROR, &e).ok();
                            return;
                        }

                        match db::upsert_quiz(&ctx.db_pool, &id, subj, questions_json, theme_id.map(|s| s.to_string())).await {
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
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                // Update an existing quiz in place: {id, subject, questions[]}.
                // Keeps the SAME id (matches Node updateQuizz, which returns the input id).
                let id = payload.get("id").and_then(|v| v.as_str());
                let subject = payload.get("subject").and_then(|v| v.as_str());
                let questions = payload.get("questions").and_then(|v| v.as_array());
                let theme_id = payload.get("themeId").and_then(|v| v.as_str());

                match (id, subject, questions) {
                    (Some(quiz_id), Some(subj), Some(qs))
                        if !quiz_id.is_empty() && !subj.is_empty() && !qs.is_empty() =>
                    {
                        let questions_json = payload.get("questions").cloned().unwrap_or(serde_json::json!([]));

                        // Validate questions against full questionValidator
                        if let Err(e) = validate_questions(&questions_json) {
                            socket.emit(constants::quizz::ERROR, e).ok();
                            return;
                        }

                        if let Err(e) = safe_asset_id(quiz_id) {
                            socket.emit(constants::quizz::ERROR, &e).ok();
                            return;
                        }

                        // Verify quiz exists before upsert — do not resurrect deleted ids
                        if !db::quiz_exists(&ctx.db_pool, quiz_id).await {
                            socket
                                .emit(constants::quizz::ERROR, "errors:quizz.notFound")
                                .ok();
                            return;
                        }

                        match db::upsert_quiz(&ctx.db_pool, quiz_id, subj, questions_json, theme_id.map(|s| s.to_string())).await {
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
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

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
                    Err(_) => {
                        // Node always emits errors:quizz.failedToDelete on delete failure
                        socket
                            .emit(constants::quizz::ERROR, "errors:quizz.failedToDelete")
                            .ok();
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
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

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

                        // Re-validate the source questions before duplicating
                        let questions_json = serde_json::to_value(&quiz.questions).unwrap_or(serde_json::json!([]));
                        if validate_questions(&questions_json).is_err() {
                            socket.emit(constants::quizz::ERROR, "errors:quizz.failedToSave").ok();
                            return;
                        }

                        // Preserve archived flag from source (Node saveQuizz keeps rest fields)
                        let archived = quiz.archived.unwrap_or(false);

                        match db::duplicate_quiz(
                            &ctx.db_pool,
                            &source_id,
                            &new_id,
                            &new_subject,
                            archived,
                        )
                        .await
                        {
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
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

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
