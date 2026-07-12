//! AI provider configuration + text generation handlers (6 socket events).
//!
//! All handlers are auth-gated (manager-only) and text-gen handlers use a shared
//! rate limiter (per-client cooldown + lifetime cap, keyed by durable client ID).
//!
//! Integrates with ai_secrets, ai_provider, and ai_ratelimit modules.

use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    // ---- GET_SETTINGS ----
    socket.on(constants::ai::GET_SETTINGS, {
        let ctx = ctx.clone();
        move |socket: SocketRef| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                socket
                    .emit(constants::ai::SETTINGS, &super::ai_config::get_public_ai_settings())
                    .ok();
            });
        }
    });

    // ---- SET_SETTINGS ----
    socket.on(constants::ai::SET_SETTINGS, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                // Validate payload
                if let Err(err) = super::ai_validate::validate_set_settings(&payload) {
                    socket.emit(constants::ai::ERROR, &err).ok();
                    return;
                }

                match super::ai_config::persist_ai_settings(&payload).await {
                    Ok(_) => {
                        socket.emit(constants::ai::SET_SETTINGS_SUCCESS, &"").ok();
                        socket
                            .emit(constants::ai::SETTINGS, &super::ai_config::get_public_ai_settings())
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::ai::ERROR, &e).ok();
                    }
                }
            });
        }
    });

    // ---- SET_KEY ----
    socket.on(constants::ai::SET_KEY, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_admin().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                // Validate and extract payload
                let (provider_id, key) = match super::ai_validate::validate_set_key(&payload) {
                    Ok(result) => result,
                    Err(err) => {
                        socket.emit(constants::ai::ERROR, &err).ok();
                        return;
                    }
                };

                match super::ai_secrets::set_key(&provider_id, key) {
                    Ok(()) => {
                        socket
                            .emit(constants::ai::SETTINGS, &super::ai_config::get_public_ai_settings())
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::ai::ERROR, &e).ok();
                    }
                }
            });
        }
    });

    // ---- TEST_PROVIDER ----
    socket.on(constants::ai::TEST_PROVIDER, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                if !super::ai_ratelimit::allow_text_gen(
                    &ctx.client_id,
                    constants::AI::TEXT_GEN_COOLDOWN_MS,
                    constants::AI::TEXT_GEN_MAX_PER_SOCKET,
                ) {
                    socket
                        .emit(
                            constants::ai::TEST_RESULT,
                            &serde_json::json!({
                                "ok": false,
                                "message": "errors:ai.rateLimited"
                            }),
                        )
                        .ok();
                    return;
                }

                // Validate payload (emit TEST_RESULT on failure, not ERROR)
                if let Err(err) = super::ai_validate::validate_test_provider(&payload) {
                    socket
                        .emit(
                            constants::ai::TEST_RESULT,
                            &serde_json::json!({
                                "ok": false,
                                "message": err
                            }),
                        )
                        .ok();
                    return;
                }

                match super::ai_provider::generate_text(super::ai_provider::GenerateTextOptions {
                    system: None,
                    prompt: "ping".to_string(),
                    json: false,
                    max_tokens: Some(5),
                })
                .await
                {
                    Ok(_) => {
                        socket
                            .emit(
                                constants::ai::TEST_RESULT,
                                &serde_json::json!({
                                    "ok": true,
                                    "message": "manager:ai.testOk"
                                }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        socket
                            .emit(
                                constants::ai::TEST_RESULT,
                                &serde_json::json!({
                                    "ok": false,
                                    "message": e
                                }),
                            )
                            .ok();
                    }
                }
            });
        }
    });

    // ---- GENERATE_QUESTION ----
    socket.on(constants::ai::GENERATE_QUESTION, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                if !super::ai_ratelimit::allow_text_gen(
                    &ctx.client_id,
                    constants::AI::TEXT_GEN_COOLDOWN_MS,
                    constants::AI::TEXT_GEN_MAX_PER_SOCKET,
                ) {
                    socket.emit(constants::ai::ERROR, &"errors:ai.rateLimited").ok();
                    return;
                }

                // Validate and extract payload
                let (topic, q_type, language) = match super::ai_validate::validate_generate_question(&payload) {
                    Ok(result) => result,
                    Err(err) => {
                        socket.emit(constants::ai::ERROR, &err).ok();
                        return;
                    }
                };

                match super::ai_provider::generate_question(&topic, &q_type, &language).await {
                    Ok(question) => {
                        socket
                            .emit(
                                constants::ai::QUESTION_GENERATED,
                                &serde_json::json!({ "question": question }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::ai::ERROR, &e).ok();
                    }
                }
            });
        }
    });

    // ---- GENERATE_DISTRACTORS ----
    socket.on(constants::ai::GENERATE_DISTRACTORS, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                if !super::ai_ratelimit::allow_text_gen(
                    &ctx.client_id,
                    constants::AI::TEXT_GEN_COOLDOWN_MS,
                    constants::AI::TEXT_GEN_MAX_PER_SOCKET,
                ) {
                    socket.emit(constants::ai::ERROR, &"errors:ai.rateLimited").ok();
                    return;
                }

                // Validate and extract payload
                let (question, correct, count, language) = match super::ai_validate::validate_generate_distractors(&payload) {
                    Ok(result) => result,
                    Err(err) => {
                        socket.emit(constants::ai::ERROR, &err).ok();
                        return;
                    }
                };

                match super::ai_provider::generate_distractors(&question, &correct, count, &language)
                    .await
                {
                    Ok(distractors) => {
                        socket
                            .emit(
                                constants::ai::DISTRACTORS_GENERATED,
                                &serde_json::json!({ "distractors": distractors }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::ai::ERROR, &e).ok();
                    }
                }
            });
        }
    });

    // ---- GENERATE_QUIZ ----
    socket.on(constants::ai::GENERATE_QUIZ, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                if !super::ai_ratelimit::allow_text_gen(
                    &ctx.client_id,
                    constants::AI::TEXT_GEN_COOLDOWN_MS,
                    constants::AI::TEXT_GEN_MAX_PER_SOCKET,
                ) {
                    socket.emit(constants::ai::ERROR, &"errors:ai.rateLimited").ok();
                    return;
                }

                // Validate and extract payload
                let (topic, count, language) = match super::ai_validate::validate_generate_quiz(&payload) {
                    Ok(result) => result,
                    Err(err) => {
                        socket.emit(constants::ai::ERROR, &err).ok();
                        return;
                    }
                };

                match super::ai_provider::generate_quiz(&topic, count, &language).await {
                    Ok(quizz) => {
                        socket
                            .emit(
                                constants::ai::QUIZ_GENERATED,
                                &serde_json::json!({ "quizz": quizz }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::ai::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}
