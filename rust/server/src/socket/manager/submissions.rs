//! MANAGER SUBMISSION HANDLERS
//!
//! LIST_SUBMISSIONS — fetch full submissions for moderation panel
//! EDIT_SUBMISSION — validate and update submission question
//! APPROVE_SUBMISSION — approve to quiz or catalog
//! REJECT_SUBMISSION — reject with optional reason/category

use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use razzoozle_protocol::constants;
use razzoozle_protocol::manager::SubmissionCategory;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list_submissions(socket, ctx.clone());
    register_edit_submission(socket, ctx.clone());
    register_approve_submission(socket, ctx.clone());
    register_reject_submission(socket, ctx.clone());
}

fn register_list_submissions(socket: &SocketRef, ctx: HandlerCtx) {
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

fn register_edit_submission(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::EDIT_SUBMISSION, {
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

                // Extract id and question from payload
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalidId")
                            .ok();
                        return;
                    }
                };

                let question = match payload.get("question") {
                    Some(q) if q.is_object() => q.clone(),
                    _ => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalidQuestion")
                            .ok();
                        return;
                    }
                };

                // Check submission exists
                if db::get_submission_by_id(&ctx.db_pool, &id).await.is_none() {
                    socket
                        .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.notFound")
                        .ok();
                    return;
                }

                // Validate question payload with serde_json::from_value
                if serde_json::from_value::<razzoozle_protocol::quizz::Question>(question.clone()).is_err() {
                    socket
                        .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalidQuestion")
                        .ok();
                    return;
                }

                // Update submission with the new question
                let patch = serde_json::json!({ "question": question });

                match db::update_submission(&ctx.db_pool, &id, &patch).await {
                    Ok(_) => {
                        // Round-trip config back to client
                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Err(e) => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, &e)
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_approve_submission(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::APPROVE_SUBMISSION, {
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

                // Extract id, quizzId (optional), toCatalog (optional)
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalidId")
                            .ok();
                        return;
                    }
                };

                let to_catalog = payload.get("toCatalog").and_then(|v| v.as_bool()).unwrap_or(false);
                let quiz_id = payload.get("quizzId").and_then(|v| v.as_str()).map(|s| s.to_string());

                // Fetch the submission to get the question + submittedBy
                let submission = match db::get_submission_by_id(&ctx.db_pool, &id).await {
                    Some(sub) => sub,
                    None => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.notFound")
                            .ok();
                        return;
                    }
                };

                // Approve-to-catalog path
                if to_catalog {
                    // Save to catalog
                    let question = submission.get("question").cloned().unwrap_or(serde_json::json!({}));
                    match db::insert_catalog_entry(
                        &ctx.db_pool,
                        &question,
                        "submission",
                    ).await {
                        Ok(_) => {
                            // Update submission status to "approved"
                            let patch = serde_json::json!({ "status": "approved" });
                            match db::update_submission(&ctx.db_pool, &id, &patch).await {
                                Ok(_) => {
                                    config_helper::build_and_emit_config(&socket, &ctx).await;
                                }
                                Err(e) => {
                                    socket
                                        .emit(constants::manager::SUBMISSION_ERROR, &e)
                                        .ok();
                                }
                            }
                        }
                        Err(e) => {
                            socket
                                .emit(constants::manager::SUBMISSION_ERROR, &e)
                                .ok();
                        }
                    }
                    return;
                }

                // Append-to-quizz path
                let quiz_id = match quiz_id {
                    Some(qid) => qid,
                    None => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.quizzNotFound")
                            .ok();
                        return;
                    }
                };

                // Build the question to append (with submittedBy preserved)
                let mut question_to_append = submission.get("question").cloned().unwrap_or(serde_json::json!({}));
                if let Some(submitted_by) = submission.get("submittedBy").and_then(|v| v.as_str()) {
                    question_to_append["submittedBy"] = serde_json::json!(submitted_by);
                }

                // Append question to quiz
                match db::append_question_to_quiz(&ctx.db_pool, &quiz_id, &question_to_append).await {
                    Ok(_) => {
                        // Update submission status to "approved"
                        let patch = serde_json::json!({ "status": "approved" });
                        match db::update_submission(&ctx.db_pool, &id, &patch).await {
                            Ok(_) => {
                                // Reload quiz registry and emit config
                                {
                                    let quizzes = db::get_quizzes(&ctx.db_pool).await;
                                    let mut registry = ctx.registry.write().await;
                                    registry.reload_quizzes(quizzes);
                                }

                                config_helper::build_and_emit_config(&socket, &ctx).await;
                            }
                            Err(e) => {
                                socket
                                    .emit(constants::manager::SUBMISSION_ERROR, &e)
                                    .ok();
                            }
                        }
                    }
                    Err(e) => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, &e)
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_reject_submission(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::REJECT_SUBMISSION, {
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

                // Extract id (required)
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalidId")
                            .ok();
                        return;
                    }
                };

                // Extract optional reason and category
                let reason = payload.get("reason").and_then(|v| v.as_str());
                let category = payload.get("category").and_then(|v| v.as_str());

                // Validate reason length (max 500 chars)
                if let Some(r) = reason {
                    if r.len() > 500 {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.reasonTooLong")
                            .ok();
                        return;
                    }
                }

                // Validate category enum if provided
                if let Some(c) = category {
                    match serde_json::from_value::<SubmissionCategory>(serde_json::json!(c)) {
                        Ok(_) => {
                            // Category is valid, continue
                        }
                        Err(_) => {
                            socket
                                .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalidCategory")
                                .ok();
                            return;
                        }
                    }
                }

                // Build the patch: always set status to "rejected"
                let mut patch = serde_json::json!({ "status": "rejected" });

                if let Some(r) = reason {
                    patch["rejectionReason"] = serde_json::json!(r);
                }

                if let Some(c) = category {
                    patch["category"] = serde_json::json!(c);
                }

                // Update submission
                match db::update_submission(&ctx.db_pool, &id, &patch).await {
                    Ok(_) => {
                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Err(e) => {
                        socket
                            .emit(constants::manager::SUBMISSION_ERROR, &e)
                            .ok();
                    }
                }
            });
        }
    });
}
