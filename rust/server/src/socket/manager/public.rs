//! MANAGER.GET_THEME, SUBMIT_QUESTION — public/unauthenticated handlers

use super::super::validation;
use super::super::HandlerCtx;
use crate::db;
use crate::http::RATE_LIMITER;
use crate::state;
use razzoozle_protocol::constants;
use razzoozle_protocol::manager::SubmissionCategory;
use socketioxide::extract::{Data, SocketRef};
use lazy_static::lazy_static;

// Default theme constant (mirrors Node's DEFAULT_THEME from packages/common/src/types/theme.ts)
lazy_static! {
    static ref DEFAULT_THEME: serde_json::Value = serde_json::json!({
        "style": "flat",
        "colorPrimary": "#7c3aed",
        "colorSecondary": "#2e1065",
        "colorText": "#ffffff",
        "answerColors": ["#E69F00", "#56B4E9", "#3DBFA0", "#CC79A7"],
        "answerTextColor": "#0B0B12",
        "accentColor": "#ff9900",
        "radius": 16,
        "scrim": 0,
        "appTitle": null,
        "logo": null,
        "showBranding": true,
        "backgrounds": {
            "auth": null,
            "managerGame": null,
            "playerGame": null,
            "animated": {
                "auth": {
                    "type": "creamBackdrop",
                    "speed": 1,
                    "intensity": 1,
                    "iconCount": 12,
                    "color": ""
                },
                "managerGame": {
                    "type": "creamBackdrop",
                    "speed": 1,
                    "intensity": 1,
                    "iconCount": 12,
                    "color": ""
                },
                "playerGame": {
                    "type": "creamBackdrop",
                    "speed": 1,
                    "intensity": 1,
                    "iconCount": 12,
                    "color": ""
                }
            },
            "animatedCss": ""
        },
        "teamColors": {
            "red": "#ef4444",
            "blue": "#3b82f6",
            "green": "#22c55e",
            "yellow": "#facc15"
        },
        "tierColors": {
            "bronze": "#b45309",
            "silver": "#9ca3af",
            "gold": "#eab308",
            "diamant": "#38bdf8"
        },
        "stateColors": {
            "correct": "#22c55e",
            "wrong": "#ef4444"
        },
        "rankColors": {
            "up": "#10b981",
            "down": "#f43f5e"
        },
        "timerUrgent": "#ff3b30",
        "streakColor": "#b45309",
        "surfaceMuted": "#374151",
        "footerColors": {
            "bg": "#ffffff",
            "text": "#1f2937"
        },
        "animation": {
            "springStiffness": 300,
            "springDamping": 24,
            "durationScale": 1,
            "staggerScale": 1
        },
        "sounds": {
            "answersMusic": null,
            "answersSound": null,
            "podiumThree": null,
            "podiumSecond": null,
            "podiumFirst": null,
            "podiumSnearRoll": null,
            "results": null,
            "show": null,
            "boump": null,
            "tierBronze": null,
            "tierSilver": null,
            "tierGold": null,
            "tierDiamant": null
        },
        "customCssEnabled": false,
        "customJsEnabled": false,
        "skeletonVersion": 0
    });
}


pub fn get_default_theme() -> serde_json::Value {
    DEFAULT_THEME.clone()
}
pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_get_theme(socket, ctx.clone());
    register_submit_question(socket, ctx);
}

fn register_get_theme(socket: &SocketRef, _ctx: HandlerCtx) {
    socket.on(constants::manager::GET_THEME, {
        move |socket: SocketRef| {
            tokio::spawn(async move {
                let theme_path = "config/theme/theme.json";
                
                let theme = match tokio::fs::read_to_string(theme_path).await {
                    Ok(contents) => {
                        match serde_json::from_str::<serde_json::Value>(&contents) {
                            Ok(parsed) => {
                                // Merge with DEFAULT_THEME for any missing top-level keys
                                if let Some(obj) = parsed.as_object() {
                                    let mut merged = DEFAULT_THEME.clone();
                                    if let Some(merged_obj) = merged.as_object_mut() {
                                        for (key, val) in obj {
                                            merged_obj.insert(key.clone(), val.clone());
                                        }
                                    }
                                    merged
                                } else {
                                    DEFAULT_THEME.clone()
                                }
                            }
                            Err(_) => DEFAULT_THEME.clone(),
                        }
                    }
                    Err(_) => DEFAULT_THEME.clone(),
                };
                
                socket.emit(constants::manager::THEME, &theme).ok();
            });
        }
    });
}

fn register_submit_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SUBMIT_QUESTION, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Coarse server-wide ceiling FIRST: it has no per-user side effect, whereas
                // the per-client check below increments the user's counter. Checking the
                // global ceiling first means tripping it never burns a legit user's personal
                // 3/60s budget (defense-in-depth against many distinct clients flooding).
                if !RATE_LIMITER.check_global_submission_rate() {
                    socket
                        .emit(
                            constants::manager::SUBMISSION_ERROR,
                            "errors:submission.rateLimited",
                        )
                        .ok();
                    return;
                }

                // Per-client throttle keyed by the DURABLE clientId so a reconnect does NOT
                // reset the quota (socket.id changed on every reconnect → trivial bypass).
                // Uses dedicated submission rate limit (3/60s per client), NOT the shared
                // solo-quiz limiter (120/min).
                if !RATE_LIMITER.check_submission_rate(&ctx.client_id) {
                    socket
                        .emit(
                            constants::manager::SUBMISSION_ERROR,
                            "errors:submission.rateLimited",
                        )
                        .ok();
                    return;
                }

                // Trust-boundary validation: the submit UI validates the full shape,
                // but this endpoint is public, so cap sizes so an oversized/garbage
                // payload cannot abuse the DB — submittedBy fits VARCHAR(100), the
                // question text and the whole serialized object are bounded.
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
                let question_bytes = serde_json::to_string(&question)
                    .map(|s| s.len())
                    .unwrap_or(usize::MAX);

                if submitted_by.is_empty()
                    || submitted_by.chars().count() > 100
                    || q_text.is_empty()
                    || q_text.chars().count() > 1000
                    || !question.is_object()
                    || question_bytes > 16_384
                {
                    socket
                        .emit(constants::manager::SUBMISSION_ERROR, "errors:submission.invalid")
                        .ok();
                    return;
                }

                // Full questionValidator (Node submissionValidator includes questionValidator)
                if let Err(key) = validation::validate_question(&question) {
                    socket
                        .emit(constants::manager::SUBMISSION_ERROR, key)
                        .ok();
                    return;
                }

                // Optional category — must be a known SubmissionCategory enum value
                let category: Option<String> = match payload.get("category") {
                    None | Some(serde_json::Value::Null) => None,
                    Some(v) => {
                        if serde_json::from_value::<SubmissionCategory>(v.clone()).is_err() {
                            socket
                                .emit(
                                    constants::manager::SUBMISSION_ERROR,
                                    "errors:submission.invalid",
                                )
                                .ok();
                            return;
                        }
                        // Persist the wire string (lowercase enum rename)
                        v.as_str().map(|s| s.to_string())
                    }
                };

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

                match db::insert_submission(
                    &ctx.db_pool,
                    &id,
                    &submitted_by,
                    &question,
                    category.as_deref(),
                )
                .await
                {
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
