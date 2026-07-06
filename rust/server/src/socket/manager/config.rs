//! MANAGER CONFIG WRITES — game config and achievements config handlers
//!
//! manager:setGameConfig — PATCH game config (teamMode, lowLatencyEnabled, joinLocked, randomizeAnswers, scoringMode)
//! manager:setAchievementsConfig — PATCH achievements config (per-achievement deep-merge by id)

use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_set_game_config(socket, ctx.clone());
    register_set_achievements_config(socket, ctx.clone());
}

fn register_set_game_config(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_GAME_CONFIG, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate
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

                // Validate and filter the payload: only accept boolean fields and valid enum
                let mut patch = serde_json::json!({});

                if let Some(team_mode) = payload.get("teamMode").and_then(|v| v.as_bool()) {
                    patch["teamMode"] = serde_json::json!(team_mode);
                }

                if let Some(low_latency_enabled) = payload.get("lowLatencyEnabled").and_then(|v| v.as_bool()) {
                    patch["lowLatencyEnabled"] = serde_json::json!(low_latency_enabled);
                }

                if let Some(join_locked) = payload.get("joinLocked").and_then(|v| v.as_bool()) {
                    patch["joinLocked"] = serde_json::json!(join_locked);
                }

                if let Some(randomize_answers) = payload.get("randomizeAnswers").and_then(|v| v.as_bool()) {
                    patch["randomizeAnswers"] = serde_json::json!(randomize_answers);
                }

                if let Some(scoring_mode) = payload.get("scoringMode").and_then(|v| v.as_str()) {
                    if scoring_mode == "speed" || scoring_mode == "accuracy" {
                        patch["scoringMode"] = serde_json::json!(scoring_mode);
                    }
                }

                // If no recognized fields, silent no-op (consistent with Node)
                if !patch.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
                    return;
                }

                // Persist to DB
                match db::update_game_config(&ctx.db_pool, &patch).await {
                    Ok(_) => {
                        // Round-trip config back to client
                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Err(_e) => {
                        // Validation failure is non-fatal (silent no-op, consistent with Node)
                    }
                }
            });
        }
    });
}

fn register_set_achievements_config(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_ACHIEVEMENTS_CONFIG, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate
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

                // Extract config from payload: { config: {...} }
                let config = match payload.get("config") {
                    Some(c) if c.is_object() => c.clone(),
                    _ => {
                        // Malformed payload is a silent no-op
                        return;
                    }
                };

                // Persist to DB
                match db::update_achievements_config(&ctx.db_pool, &config).await {
                    Ok(_) => {
                        // Round-trip config back to client
                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Err(_e) => {
                        // Validation failure is non-fatal (silent no-op, consistent with Node)
                    }
                }
            });
        }
    });
}
