//! MANAGER.AUTH, LOGOUT, RECONNECT — manager session handlers

use super::super::HandlerCtx;
use crate::db;
use crate::http::RATE_LIMITER;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::ScoringMode;
use socketioxide::extract::{Data, SocketRef};
use std::collections::HashSet;

const DEFAULT_MANAGER_PASSWORD: &str = "PASSWORD";

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_auth(socket, ctx.clone());
    register_logout(socket, ctx.clone());
    register_reconnect(socket, ctx.clone());
}

fn register_auth(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::AUTH, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<String>(password)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth brute-force throttle (per client ID)
                if RATE_LIMITER.record_auth_failure_and_check_throttle(&ctx.client_id) {
                    socket
                        .emit(constants::manager::ERROR_MESSAGE, "errors:manager.authThrottled")
                        .ok();
                    return;
                }

                let expected_password = match db::get_manager_password(&ctx.db_pool).await {
                    Some(pw) => pw,
                    None => std::env::var("MANAGER_PASSWORD")
                        .unwrap_or_else(|_| DEFAULT_MANAGER_PASSWORD.to_string()),
                };

                if password == expected_password {
                    {
                        let mut registry = ctx.registry.write().await;
                        registry.login_client(ctx.client_id.clone());
                    }

                    // Populate ManagerConfig from database and registry
                    let quizz = build_quizz_with_ids(&ctx).await;
                    let media = db::get_media_list(&ctx.db_pool).await;
                    let results = db::get_results(&ctx.db_pool).await;
                    let submissions = db::get_submissions(&ctx.db_pool).await;
                    let theme_templates = db::get_themes(&ctx.db_pool).await;
                    let achievements = db::get_achievements(&ctx.db_pool).await;
                    let plugins = db::get_plugins(&ctx.db_pool).await;
                    let (team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode) =
                        db::get_game_config(&ctx.db_pool).await;

                    let dev_mode_on = std::env::var("RAZZOOLE_DEV").as_deref() == Ok("1");

                    let payload = razzoozle_protocol::manager::ManagerConfig {
                        quizz: serde_json::Value::Array(quizz),
                        results: serde_json::Value::Array(results),
                        submissions: serde_json::json!(submissions),
                        media: Some(serde_json::Value::Array(media)),
                        theme_templates: Some(serde_json::Value::Array(theme_templates)),
                        team_mode,
                        low_latency_enabled,
                        join_locked,
                        randomize_answers,
                        scoring_mode: scoring_mode.and_then(|s| {
                            match s.as_str() {
                                "speed" => Some(ScoringMode::Speed),
                                "accuracy" => Some(ScoringMode::Accuracy),
                                _ => None,
                            }
                        }),
                        achievements: Some(serde_json::Value::Array(achievements)),
                        dev_mode: Some(dev_mode_on),
                        // Only ship the dev API key when dev mode is on (it is only
                        // used by dev-gated endpoints) — and it reaches authenticated
                        // managers only, after the password check above.
                        dev_api_key: if dev_mode_on {
                            std::env::var("DEV_API_KEY").ok()
                        } else {
                            None
                        },
                        plugins: Some(parse_plugins_from_json(plugins)),
                        observability: None,
                    };

                    socket.emit(constants::manager::CONFIG, &payload).ok();
                } else {
                    socket
                        .emit(constants::manager::ERROR_MESSAGE, "errors:manager.invalidPassword")
                        .ok();
                }
            });
        }
    });
}

/// Build QuizzWithId array from registry and database
/// Each quiz includes its id plus the quiz fields (subject, questions, archived, theme_id)
async fn build_quizz_with_ids(ctx: &HandlerCtx) -> Vec<serde_json::Value> {
    let registry = ctx.registry.read().await;
    let quiz_ids = registry.list_quiz_ids();
    drop(registry);

    let mut quizz = Vec::new();
    for id in quiz_ids {
        let registry = ctx.registry.read().await;
        if let Some(quiz) = registry.get_quiz_by_id(&id) {
            let quizz_obj = serde_json::json!({
                "id": id,
                "subject": quiz.subject,
                "questions": quiz.questions,
                "archived": quiz.archived,
                "themeId": quiz.theme_id,
            });
            quizz.push(quizz_obj);
        }
    }

    quizz
}

/// Parse plugins from JSON array and convert to InstalledPlugin structs
fn parse_plugins_from_json(plugins: Vec<serde_json::Value>) -> Vec<razzoozle_protocol::manager::InstalledPlugin> {
    plugins.into_iter()
        .filter_map(|p| {
            let id = p["id"].as_str()?.to_string();
            let name = p["name"].as_str()?.to_string();
            let version = p["version"].as_str()?.to_string();
            let enabled = p["enabled"].as_bool().unwrap_or(false);
            let capabilities = p["capabilities"]
                .as_array()?
                .iter()
                .filter_map(|c| c.as_str().map(|s| s.to_string()))
                .collect();
            let config = p.get("config").and_then(|c| {
                if c.is_object() {
                    Some(c.as_object()?.clone().into_iter()
                        .map(|(k, v)| (k, v))
                        .collect())
                } else {
                    None
                }
            });

            Some(razzoozle_protocol::manager::InstalledPlugin {
                id,
                name,
                version,
                enabled,
                capabilities,
                config,
            })
        })
        .collect()
}

fn register_logout(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::LOGOUT, {
        let ctx = ctx.clone();

        move |_socket: SocketRef, _data: Data::<serde_json::Value>| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let mut registry = ctx.registry.write().await;
                registry.logout_client(&ctx.client_id);
            });
        }
    });
}

fn register_reconnect(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RECONNECT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                    return;
                }

                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                if let Some(game_id) = game_id_opt {
                    let game_id = game_id.to_string();

                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !crate::is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let mut game = game_ref.lock().unwrap();

                        // Update manager socket
                        game.manager_socket_id = socket.id.to_string();

                        let game_id = game.game_id.clone();
                        let players = game.players.clone();

                        drop(game);

                        // Join the room
                        socket.join(game_id.clone());

                        // Emit reconnect success with game state
                        socket.emit(constants::manager::SUCCESS_RECONNECT, &serde_json::json!({
                            "gameId": game_id,
                            "status": "reconnected",
                            "players": players,
                        })).ok();

                        // Broadcast to room that manager reconnected
                        ctx.io.to(game_id)
                            .emit(constants::manager::PLAYER_RECONNECTED, &serde_json::json!({}))
                            .ok();
                    } else {
                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.notFound").ok();
                    }
                }
            });
        }
    });
}
