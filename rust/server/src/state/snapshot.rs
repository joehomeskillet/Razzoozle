use crate::state::Game;
use razzoozle_engine::state::GamePhase;
use std::fs;
use std::path::PathBuf;
use tracing::{info, warn};

/// Snapshot format version — bump when changing the structure.
/// v2: Added currentAnswers, answerOrder, recapStats, questionStats, questionsHistory
/// v3: Added selectedModes.experienceMode (WP #878)
/// (backward-compatible via serde defaults / defensive restore for old snapshots)
// v4: selectedModes.teamAssignment (WP #952). v3 snaps omit it → SelfAssign default.
// v5: activeEffects FlowerBattle power-up status (WP #932). v1–v4 omit → empty.
// v6: flowerBattleOffers + sunPoints + winnerTeamIds (WP #933). v1–v5 omit → empty.
const SNAPSHOT_VERSION: u32 = 6;

/// Get the snapshot directory path. Uses CONFIG_PATH env var or falls back to relative path.
pub fn snapshot_dir() -> PathBuf {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        PathBuf::from(&config_path).join("state")
    } else {
        // Fallback: assume running from rust/server, config is at ../../config
        let cwd = std::env::current_dir().unwrap_or_default();
        cwd.parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("config/state"))
            .unwrap_or_else(|| PathBuf::from("config/state"))
    }
}

/// Get the snapshot file path.
/// Separate file from Node's registry.json: both twins share the config mount;
/// a shared file would let each backend's 5s task clobber the other's crash-recovery state.
pub fn snapshot_file() -> PathBuf {
    snapshot_dir().join("registry-rust.json")
}

/// Serialize a single game to a JSON-compatible snapshot value.
/// Saves the stable state needed for crash recovery: gameId, inviteCode, manager_client_id, players, quiz, phase, etc.
///
/// WP-M Fix: Tokens are saved in a separate "playerTokens" map since player_token has serde(skip)
/// for wire safety. This ensures tokens survive round-trip for reconnect token-based lookups.
///
/// W1-1 Fix: Persist in-flight answers and per-question stats so a mid-question crash
/// does not lose the current question's answer submissions.
pub fn game_to_snapshot(game: &Game) -> serde_json::Value {
    // Extract player tokens into a separate map (only Some values).
    // This preserves tokens for crash recovery while keeping the Player wire-serialization clean.
    let player_tokens: std::collections::HashMap<String, String> = game
        .players
        .iter()
        .filter_map(|p| p.player_token.clone().map(|token| (p.id.clone(), token)))
        .collect();

    // Serialize current_answers (HashMap<String, Answer> → JSON-friendly structure)
    let current_answers = game
        .engine
        .current_answers
        .iter()
        .map(|(client_id, answer)| {
            serde_json::json!({
                "clientId": client_id,
                "answerInput": {
                    "answerKey": answer.answer_input.answer_key,
                    "answerKeys": &answer.answer_input.answer_keys,
                    "answerText": &answer.answer_input.answer_text,
                },
                "responseTimeMs": answer.response_time_ms,
            })
        })
        .collect::<Vec<_>>();

    // Serialize recap_stats (HashMap<String, RecapStat>)
    let recap_stats = game
        .engine
        .recap_stats
        .iter()
        .map(|(player_id, stat)| {
            serde_json::json!({
                "playerId": player_id,
                "username": &stat.username,
                "fastestMs": stat.fastest_ms,
                "peakStreak": stat.peak_streak,
                "correct": stat.correct,
                "wrong": stat.wrong,
                "answered": stat.answered,
                "bestClimb": stat.best_climb,
                "worstRankEver": stat.worst_rank_ever,
                "achievementIds": &stat.achievement_ids,
                "luckyGuess": stat.lucky_guess,
            })
        })
        .collect::<Vec<_>>();

    // Serialize question_stats (HashMap<i32, QuestionStat>)
    let question_stats = game
        .engine
        .question_stats
        .iter()
        .map(|(question_index, stat)| {
            serde_json::json!({
                "questionIndex": question_index,
                "correct": stat.correct,
                "total": stat.total,
            })
        })
        .collect::<Vec<_>>();

    serde_json::json!({
        "gameId": game.game_id,
        "inviteCode": game.invite_code,
        "managerClientId": game.manager_client_id,
        "ownerUserId": game.owner_user_id,
        "classId": game.class_id,
        "hostToken": game.host_token,
        "started": game.engine.phase != GamePhase::ShowRoom,
        "phase": match game.engine.phase {
            GamePhase::ShowRoom => "WAIT",
            GamePhase::ShowStart => "SHOW_START",
            GamePhase::ShowQuestion => "SHOW_QUESTION",
            GamePhase::SelectAnswer => "SELECT_ANSWER",
            GamePhase::ShowResult => "SHOW_RESULT",
            GamePhase::ShowRoundRecap => "SHOW_ROUND_RECAP",
            GamePhase::ShowLeaderboard => "SHOW_LEADERBOARD",
            GamePhase::Finished => "FINISHED",
        },
        "quizz": &game.engine.quiz,
        "quizId": game.quiz_id,
        "lowLatencyConfig": game.low_latency_config,
        "players": &game.players,
        "playerTokens": player_tokens,
        "autoMode": game.auto_mode,
        "currentQuestionIndex": game.engine.current_question_index,
        // Absolute wall-clock answer deadline (ms since epoch) of the in-flight
        // question, persisted so a mid-SELECT_ANSWER restore can reason about
        // remaining time. See resume_plan_from_snapshot / resume_game_lifecycle (#12).
        "answerDeadlineAtServerMs": game.deadline_ms,
        // Last recorded manager status for reconnect replay
        "lastManagerStatus": game.last_manager_status.as_ref().map(|(status, data)| {
            serde_json::json!({
                "name": status,
                "data": data,
            })
        }),
        "selectedModes": {
            "scoringMode": game.selected_modes.scoring_mode.clone(),
            "teamMode": game.selected_modes.team_mode,
            "klassen": game.selected_modes.klassen,
            "endScreen": game.selected_modes.end_screen,
            "participantCap": game.selected_modes.participant_cap,
            "experienceMode": game.selected_modes.experience_mode,
            "teamAssignment": game.selected_modes.team_assignment,
        },
        // W1-1: Persist in-flight answer data and per-question stats
        "currentAnswers": current_answers,
        "answerOrder": &game.engine.answer_order,
        "recapStats": recap_stats,
        "questionStats": question_stats,
        "questionsHistory": &game.engine.questions_history,
        // WP #932: active FlowerBattle effects + growth (v5)
        "activeEffects": active_effects_to_json(&game.flower_battle_effects),
        // WP #933: offer cache + sun meter + early-finish winners (v6)
        "flowerBattleOffers": flower_battle_offers_to_json(&game.flower_battle_offers),
        "flowerBattleSunPoints": flower_battle_sun_points_to_json(&game.flower_battle_sun_points),
        "flowerBattleWinnerTeamIds": game.flower_battle_winner_team_ids.clone(),
        "finishBroadcastDone": game.finish_broadcast_done,
    })
}

fn flower_battle_offers_to_json(
    cache: &std::collections::HashMap<
        razzoozle_engine::flower_battle::OfferCacheKey,
        razzoozle_protocol::experience::PowerupOffer,
    >,
) -> serde_json::Value {
    let mut entries: Vec<serde_json::Value> = cache
        .iter()
        .map(|((game_id, team_id, q_idx), offer)| {
            serde_json::json!({
                "gameId": game_id,
                "teamId": team_id,
                "questionIndex": q_idx,
                "offer": offer,
            })
        })
        .collect();
    // Deterministic order for snapshot bytes.
    entries.sort_by(|a, b| {
        let ka = (
            a.get("gameId").and_then(|v| v.as_str()).unwrap_or(""),
            a.get("teamId").and_then(|v| v.as_str()).unwrap_or(""),
            a.get("questionIndex").and_then(|v| v.as_i64()).unwrap_or(0),
        );
        let kb = (
            b.get("gameId").and_then(|v| v.as_str()).unwrap_or(""),
            b.get("teamId").and_then(|v| v.as_str()).unwrap_or(""),
            b.get("questionIndex").and_then(|v| v.as_i64()).unwrap_or(0),
        );
        ka.cmp(&kb)
    });
    serde_json::Value::Array(entries)
}

fn flower_battle_offers_from_json(
    value: Option<&serde_json::Value>,
) -> std::collections::HashMap<
    razzoozle_engine::flower_battle::OfferCacheKey,
    razzoozle_protocol::experience::PowerupOffer,
> {
    use razzoozle_protocol::experience::PowerupOffer;
    let mut out = std::collections::HashMap::new();
    let Some(arr) = value.and_then(|v| v.as_array()) else {
        return out;
    };
    for item in arr {
        let game_id = item
            .get("gameId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let team_id = item
            .get("teamId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let q_idx = item
            .get("questionIndex")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        if game_id.is_empty() || team_id.is_empty() {
            continue;
        }
        if let Some(offer_val) = item.get("offer") {
            if let Ok(offer) = serde_json::from_value::<PowerupOffer>(offer_val.clone()) {
                out.insert((game_id, team_id, q_idx), offer);
            }
        }
    }
    out
}

fn flower_battle_sun_points_to_json(
    map: &std::collections::HashMap<String, u8>,
) -> serde_json::Value {
    let obj: serde_json::Map<String, serde_json::Value> = map
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::json!(v)))
        .collect();
    serde_json::Value::Object(obj)
}

fn flower_battle_sun_points_from_json(
    value: Option<&serde_json::Value>,
) -> std::collections::HashMap<String, u8> {
    let mut out = std::collections::HashMap::new();
    let Some(obj) = value.and_then(|v| v.as_object()) else {
        return out;
    };
    for (k, v) in obj {
        if let Some(n) = v.as_u64() {
            out.insert(k.clone(), n.min(u64::from(u8::MAX)) as u8);
        }
    }
    out
}

/// Serialize [`EffectsState`] for crash recovery (team → effects + growth + applied ids).
fn active_effects_to_json(
    effects: &razzoozle_engine::flower_battle::EffectsState,
) -> serde_json::Value {
    let teams: serde_json::Map<String, serde_json::Value> = effects
        .active
        .iter()
        .map(|(team_id, list)| {
            let arr: Vec<serde_json::Value> = list
                .iter()
                .filter_map(|e| serde_json::to_value(e).ok())
                .collect();
            (team_id.clone(), serde_json::Value::Array(arr))
        })
        .collect();
    let growth: serde_json::Map<String, serde_json::Value> = effects
        .growth_stage
        .iter()
        .map(|(team_id, stage)| (team_id.clone(), serde_json::json!(stage)))
        .collect();
    // Sorted for deterministic snapshot bytes.
    let mut applied: Vec<String> = effects.applied_offers.keys().cloned().collect();
    applied.sort();
    serde_json::json!({
        "teams": teams,
        "growthStage": growth,
        "appliedIds": applied,
        "victoryResolved": effects.victory_resolved,
    })
}

/// Restore effects from snapshot; missing/malformed → empty (defensive for v1–v4).
fn active_effects_from_json(
    value: Option<&serde_json::Value>,
) -> razzoozle_engine::flower_battle::EffectsState {
    use razzoozle_engine::flower_battle::{AppliedEffect, EffectsState};
    use razzoozle_protocol::experience::FlowerBattleEffect;
    use std::collections::HashMap;

    let mut state = EffectsState::new();
    let Some(v) = value else {
        return state;
    };
    if let Some(teams) = v.get("teams").and_then(|t| t.as_object()) {
        for (team_id, arr) in teams {
            let Some(list) = arr.as_array() else {
                continue;
            };
            let parsed: Vec<FlowerBattleEffect> = list
                .iter()
                .filter_map(|item| serde_json::from_value(item.clone()).ok())
                .collect();
            if !parsed.is_empty() {
                state.active.insert(team_id.clone(), parsed);
            }
        }
    }
    if let Some(growth) = v.get("growthStage").and_then(|g| g.as_object()) {
        let mut map = HashMap::new();
        for (team_id, stage_val) in growth {
            if let Some(stage) = stage_val.as_u64() {
                map.insert(team_id.clone(), stage.min(u64::from(u8::MAX)) as u8);
            }
        }
        state.growth_stage = map;
    }
    // Idempotency keys only — full AppliedEffect payload is process-local.
    // Replays after restore short-circuit without re-mutating growth/status.
    if let Some(ids) = v.get("appliedIds").and_then(|a| a.as_array()) {
        for id in ids {
            if let Some(s) = id.as_str() {
                state
                    .applied_offers
                    .entry(s.to_string())
                    .or_insert(AppliedEffect::RestoredIdempotent);
            }
        }
    }
    state.victory_resolved = v
        .get("victoryResolved")
        .or_else(|| v.get("victoryResolutionStarted")) // legacy key tolerance
        .and_then(|b| b.as_bool())
        .unwrap_or(false);
    state
}

/// Phase restoration: map saved phase strings back to GamePhase.
/// Resume semantics (mirroring Node's fromSnapshot behavior):
/// - WAIT/ShowRoom → ShowRoom (lobby, no-op on reconnect)
/// - FINISHED → Finished (game over, ready to show results)
/// - Any running state → ShowLeaderboard (safe fallback, preserves currentQuestionIndex for context)
fn restore_phase(phase_str: &str, started: bool) -> GamePhase {
    match phase_str {
        "WAIT" => GamePhase::ShowRoom,
        "SHOW_START" if started => GamePhase::ShowLeaderboard, // Resume at leaderboard
        "SHOW_QUESTION" if started => GamePhase::ShowLeaderboard,
        "SELECT_ANSWER" if started => GamePhase::ShowLeaderboard,
        "SHOW_RESULT" if started => GamePhase::ShowLeaderboard,
        "SHOW_ROUND_RECAP" if started => GamePhase::ShowLeaderboard,
        "SHOW_LEADERBOARD" => GamePhase::ShowLeaderboard,
        "FINISHED" => GamePhase::Finished,
        _ => {
            warn!(
                "Unknown phase string '{}', defaulting to ShowRoom",
                phase_str
            );
            GamePhase::ShowRoom
        }
    }
}

/// Deserialize a game snapshot back into a Game instance.
/// Returns None if the snapshot is malformed; logs the error but never panics.
///
/// WP-M Fixes:
/// 1. Restores player_token from the separate "playerTokens" map (Cause 1)
/// 2. Restores engine.phase using safe resume semantics (Cause 2)
///
/// W1-1 Fix:
/// 3. Restores in-flight current_answers, answer_order, recap_stats, question_stats, questions_history
///    with backward compatibility (old snapshots without these fields use defaults)
pub fn game_from_snapshot(snap: &serde_json::Value) -> Option<Game> {
    let game_id = snap.get("gameId")?.as_str()?.to_string();
    let invite_code = snap.get("inviteCode")?.as_str()?.to_string();
    let manager_client_id = snap
        .get("managerClientId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let owner_user_id = snap.get("ownerUserId").and_then(|v| v.as_i64());
    // OLD snapshots (pre-Wave-1) omit classId → restore as free-join (None).
    let class_id = snap.get("classId").and_then(|v| v.as_i64());
    let host_token = snap.get("hostToken")?.as_str()?.to_string();
    let auto_mode = snap.get("autoMode")?.as_bool()?;
    let mut players: Vec<razzoozle_protocol::player::Player> =
        serde_json::from_value(snap.get("players")?.clone()).ok()?;
    let quiz: razzoozle_protocol::quizz::Quizz =
        serde_json::from_value(snap.get("quizz")?.clone()).ok()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // WP-M Fix 1: Restore player tokens from the separate "playerTokens" map
    let player_tokens: std::collections::HashMap<String, String> = snap
        .get("playerTokens")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    for player in &mut players {
        if let Some(token) = player_tokens.get(&player.id) {
            player.player_token = Some(token.clone());
        }
    }

    // Create the engine with the restored quiz and players
    let mut engine = razzoozle_engine::state::GameState::new(quiz, players.clone());

    // Restore the current question index if available
    if let Some(idx) = snap.get("currentQuestionIndex").and_then(|v| v.as_u64()) {
        engine.current_question_index = idx as usize;
    }

    // WP-M Fix 2: Restore engine.phase using safe resume semantics
    let started = snap
        .get("started")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if let Some(phase_str) = snap.get("phase").and_then(|v| v.as_str()) {
        engine.phase = restore_phase(phase_str, started);
    }

    // W1-M2: Restore selected_modes from snapshot
    // v3: experienceMode; v1/v2 snapshots omit it → None (classic default).
    let selected_modes = snap
        .get("selectedModes")
        .map(|v| {
            let scoring_mode = v
                .get("scoringMode")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string());
            let team_mode = v.get("teamMode").and_then(|b| b.as_bool());
            let klassen = v.get("klassen").and_then(|b| b.as_bool());
            let end_screen = v
                .get("endScreen")
                .and_then(|e| e.as_str())
                .and_then(|es| match es {
                    "top3" => Some(razzoozle_protocol::game::EndScreen::Top3),
                    "private" => Some(razzoozle_protocol::game::EndScreen::Private),
                    "full" => Some(razzoozle_protocol::game::EndScreen::Full),
                    _ => None,
                });
            let experience_mode = v
                .get("experienceMode")
                .and_then(|e| e.as_str())
                .and_then(|em| match em {
                    "classic" => Some(razzoozle_protocol::game::ExperienceMode::Classic),
                    "pyramidClimb" => Some(razzoozle_protocol::game::ExperienceMode::PyramidClimb),
                    "deepSeaEscape" => {
                        Some(razzoozle_protocol::game::ExperienceMode::DeepSeaEscape)
                    }
                    "flowerBattle" => Some(razzoozle_protocol::game::ExperienceMode::FlowerBattle),
                    _ => None,
                });
            // v4 field; absent on v1–v3 → SelfAssign (serde default)
            let team_assignment = match v.get("teamAssignment").and_then(|t| t.as_str()) {
                Some("auto") => razzoozle_protocol::game::TeamAssignment::Auto,
                _ => razzoozle_protocol::game::TeamAssignment::SelfAssign,
            };
            razzoozle_protocol::game::SelectedModes {
                scoring_mode,
                team_mode,
                klassen,
                end_screen,
                participant_cap: v.get("participantCap").and_then(|p| p.as_i64()),
                experience_mode,
                team_assignment,
            }
        })
        .unwrap_or(razzoozle_protocol::game::SelectedModes {
            scoring_mode: None,
            team_mode: None,
            klassen: None,
            end_screen: None,
            participant_cap: None,
            experience_mode: None,
            team_assignment: Default::default(),
        });

    // W1-1 Fix: Restore in-flight answers with backward compatibility
    if let Some(answers_array) = snap.get("currentAnswers").and_then(|v| v.as_array()) {
        for answer_obj in answers_array {
            if let (Some(client_id), Some(answer_input_obj), Some(response_time_ms)) = (
                answer_obj.get("clientId").and_then(|v| v.as_str()),
                answer_obj.get("answerInput").and_then(|v| v.as_object()),
                answer_obj.get("responseTimeMs").and_then(|v| v.as_i64()),
            ) {
                // Manually deserialize AnswerInput from JSON object
                let answer_key = answer_input_obj
                    .get("answerKey")
                    .and_then(|v| v.as_i64())
                    .map(|k| k as i32);
                let answer_keys = answer_input_obj
                    .get("answerKeys")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_i64().map(|k| k as i32))
                            .collect()
                    });
                let answer_text = answer_input_obj
                    .get("answerText")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                engine.current_answers.insert(
                    client_id.to_string(),
                    razzoozle_engine::state::Answer {
                        answer_input: razzoozle_engine::eval::AnswerInput {
                            answer_key,
                            answer_keys,
                            answer_text,
                        },
                        response_time_ms,
                    },
                );
            }
        }
    }

    // W1-1 Fix: Restore answer_order (pre-reveal order of submissions)
    if let Some(order_array) = snap.get("answerOrder").and_then(|v| v.as_array()) {
        engine.answer_order = order_array
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
    }

    // W1-1 Fix: Restore recap_stats (per-player statistics collected across all questions)
    if let Some(stats_array) = snap.get("recapStats").and_then(|v| v.as_array()) {
        for stat_obj in stats_array {
            if let Some(player_id) = stat_obj.get("playerId").and_then(|v| v.as_str()) {
                let stat = razzoozle_engine::state::RecapStat {
                    username: stat_obj
                        .get("username")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    fastest_ms: stat_obj.get("fastestMs").and_then(|v| v.as_i64()),
                    peak_streak: stat_obj
                        .get("peakStreak")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    correct: stat_obj
                        .get("correct")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    wrong: stat_obj.get("wrong").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                    answered: stat_obj
                        .get("answered")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    best_climb: stat_obj
                        .get("bestClimb")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    worst_rank_ever: stat_obj
                        .get("worstRankEver")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    achievement_ids: stat_obj
                        .get("achievementIds")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default(),
                    lucky_guess: stat_obj
                        .get("luckyGuess")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                };
                engine.recap_stats.insert(player_id.to_string(), stat);
            }
        }
    }

    // W1-1 Fix: Restore question_stats (per-question statistics)
    if let Some(stats_array) = snap.get("questionStats").and_then(|v| v.as_array()) {
        for stat_obj in stats_array {
            if let Some(question_index) = stat_obj.get("questionIndex").and_then(|v| v.as_i64()) {
                let stat = razzoozle_engine::state::QuestionStat {
                    correct: stat_obj
                        .get("correct")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    total: stat_obj.get("total").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                };
                engine.question_stats.insert(question_index as i32, stat);
            }
        }
    }

    // W1-1 Fix: Restore questions_history (full history of question results)
    if let Ok(history) = serde_json::from_value(
        snap.get("questionsHistory")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    ) {
        engine.questions_history = history;
    }

    let player_cap_value = selected_modes.participant_cap.map(|u| u as usize);
    let mut game = Game {
        game_id,
        invite_code,
        manager_socket_id: String::new(), // Will be re-bound on reconnect
        owner_user_id,
        class_id,
        manager_client_id,
        host_token,
        players,
        engine,
        created_at_ms: snap
            .get("createdAtMs")
            .and_then(|v| v.as_u64())
            .unwrap_or(now),
        last_activity_ms: now,
        low_latency: snap
            .get("lowLatency")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        quiz_id: snap
            .get("quizId")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        low_latency_config: snap
            .get("lowLatencyConfig")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({"enabled": false, "clockSync": true})),
        server_seq: 0,
        auto_mode,
        cooldown_abort: None,
        paused: false,
        paused_state: None,
        last_manager_status: None,
        deadline_ms: 0,
        deadline_instant: None,
        question_start_at_server_ms: 0,
        pause_resume: std::sync::Arc::new(tokio::sync::Notify::new()),
        last_show_result_data: std::collections::HashMap::new(),
        answer_count_push_pending: false,
        bot_manager: None,
        auto_advance_task: None,
        temp_round_recap: None,
        shuffled_chunks: None,
        shuffled_items: None,
        selected_modes,
        player_cap: player_cap_value,
        // WP #931: vote maps are process-local only — never restored from snapshot.
        flower_battle_votes: std::collections::HashMap::new(),
        flower_battle_previous_attacker: std::collections::HashMap::new(),
        // WP #932: activeEffects roundtrip (v5); missing key → empty (v1–v4).
        flower_battle_effects: active_effects_from_json(snap.get("activeEffects")),
        // WP #933: offers/sun/winners (v6); missing → empty (v1–v5).
        flower_battle_offers: flower_battle_offers_from_json(snap.get("flowerBattleOffers")),
        flower_battle_sun_points: flower_battle_sun_points_from_json(
            snap.get("flowerBattleSunPoints"),
        ),
        flower_battle_winner_team_ids: snap
            .get("flowerBattleWinnerTeamIds")
            .and_then(|v| serde_json::from_value(v.clone()).ok()),
        finish_broadcast_done: snap
            .get("finishBroadcastDone")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    };

    // Restore last manager status if present
    if let Some(status_obj) = snap.get("lastManagerStatus") {
        if let (Some(name_val), Some(data)) = (status_obj.get("name"), status_obj.get("data")) {
            if let Ok(status) = serde_json::from_value(name_val.clone()) {
                game.last_manager_status = Some((status, data.clone()));
            }
        }
    }

    Some(game)
}

/// How a snapshot-restored game should resume its per-game lifecycle task
/// (BLOCKER #12). Derived from the RAW snapshot — which still carries the true
/// running phase — even though `game_from_snapshot` collapses `engine.phase` to
/// a safe ShowLeaderboard baseline for reconnect. `None` for lobby/finished
/// snapshots (nothing to drive forward).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResumePlan {
    pub game_id: String,
    /// Question index the resumed lifecycle loop opens first.
    pub start_index: usize,
    /// The snapshot caught the game AFTER the last question was already scored
    /// (post-reveal on the final question) — drive straight to FINISHED instead
    /// of opening a non-existent next question.
    pub finish_now: bool,
}

/// Classify how a restored game must resume, from the raw snapshot's TRUE phase.
///
/// Pre-reveal phases (SHOW_START/SHOW_QUESTION/SELECT_ANSWER) replay the
/// in-flight question: its points were not applied yet (reveal applies them), so
/// re-opening it is correct and cannot double-count. Per-round answer state is
/// not persisted, so the answer window simply restarts fresh.
///
/// Post-reveal phases (SHOW_RESULT/SHOW_ROUND_RECAP/SHOW_LEADERBOARD) already
/// scored question `index` (points are persisted in the players), so we advance
/// PAST it to the next question — or finish, when it was the last one, to avoid
/// re-revealing and double-counting it.
///
/// Lobby (WAIT) / FINISHED / unknown → `None` (no lifecycle to resume).
pub fn resume_plan_from_snapshot(snap: &serde_json::Value) -> Option<ResumePlan> {
    let game_id = snap.get("gameId")?.as_str()?.to_string();
    let started = snap
        .get("started")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !started {
        return None;
    }
    let phase = snap.get("phase")?.as_str()?;
    let index = snap
        .get("currentQuestionIndex")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let total = snap
        .get("quizz")
        .and_then(|q| q.get("questions"))
        .and_then(|q| q.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    match phase {
        "SHOW_START" | "SHOW_QUESTION" | "SELECT_ANSWER" => Some(ResumePlan {
            game_id,
            start_index: index,
            finish_now: false,
        }),
        "SHOW_RESULT" | "SHOW_ROUND_RECAP" | "SHOW_LEADERBOARD" => {
            if index + 1 >= total {
                Some(ResumePlan {
                    game_id,
                    start_index: index,
                    finish_now: true,
                })
            } else {
                Some(ResumePlan {
                    game_id,
                    start_index: index + 1,
                    finish_now: false,
                })
            }
        }
        _ => None,
    }
}

/// Save all in-flight games to disk. Filters out trivially-empty games (no players, not started).
/// Atomic write via temp file + rename to prevent corruption on crash mid-write.
/// Crash-guarded: a write failure logs a warning but never throws.
pub async fn save_snapshot(
    games: Vec<std::sync::Arc<std::sync::Mutex<Game>>>,
) -> Result<(), String> {
    // Filter: only save games with players or that have started
    let mut snapshots = Vec::new();
    for game_ref in games {
        if let Ok(game) = game_ref.lock() {
            if game.engine.phase != GamePhase::ShowRoom || !game.players.is_empty() {
                snapshots.push(game_to_snapshot(&game));
            }
        }
    }

    if snapshots.is_empty() {
        // No games to save; if a snapshot exists, leave it alone (could be stale but valid).
        return Ok(());
    }

    let payload = serde_json::json!({
        "version": SNAPSHOT_VERSION,
        "savedAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        "games": snapshots,
    });

    let dir = snapshot_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create snapshot directory: {}", e))?;

    let file = snapshot_file();
    let tmp = file.with_extension("json.tmp");

    tokio::fs::write(
        &tmp,
        serde_json::to_string(&payload).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| format!("Failed to write snapshot temp file: {}", e))?;

    tokio::fs::rename(&tmp, &file)
        .await
        .map_err(|e| format!("Failed to rename snapshot temp file: {}", e))?;

    Ok(())
}

/// Load games from the snapshot file on boot. Returns each loaded game (detached,
/// no socket bindings) paired with its lifecycle `ResumePlan` (`None` unless the
/// game was restored mid-flight and needs its lifecycle task re-spawned).
/// Missing file => returns empty Vec (no-op).
/// Corrupt/wrong-version file => logs a warning and returns empty Vec (never throws).
pub async fn load_snapshot() -> Vec<(Game, Option<ResumePlan>)> {
    let file = snapshot_file();

    if !file.exists() {
        return Vec::new();
    }

    let raw = match tokio::fs::read_to_string(&file).await {
        Ok(content) => content,
        Err(e) => {
            warn!("Failed to read snapshot file: {}", e);
            return Vec::new();
        }
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            warn!("Corrupt snapshot file (JSON parse failed), ignoring: {}", e);
            return Vec::new();
        }
    };

    // Accept version 1–5. Older snapshots restore with defaults for newer fields
    // (v2: in-flight answers; v3: experienceMode; v4: teamAssignment; v5: activeEffects).
    let version = parsed.get("version").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    if !(1..=SNAPSHOT_VERSION).contains(&version) {
        warn!(
            "Unrecognized snapshot version {} (expected 1..={}), ignoring",
            version, SNAPSHOT_VERSION
        );
        return Vec::new();
    }

    let games_array = match parsed.get("games") {
        Some(serde_json::Value::Array(arr)) => arr,
        _ => {
            warn!("Snapshot has no 'games' array, ignoring");
            return Vec::new();
        }
    };

    let mut restored = Vec::new();

    for snap in games_array {
        match game_from_snapshot(snap) {
            Some(game) => {
                let plan = resume_plan_from_snapshot(snap);
                restored.push((game, plan));
            }
            None => {
                warn!("Failed to restore a game from snapshot, continuing");
            }
        }
    }

    if !restored.is_empty() {
        info!("Restored {} game(s) from snapshot", restored.len());
    }

    restored
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test that player tokens are preserved through snapshot round-trip.
    /// WP-M Fix 1 validation: Tokens must survive serialization/deserialization.
    #[test]
    fn test_snapshot_roundtrip_player_tokens() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-1",
            "managerClientId": "mgr-client",
            "hostToken": "host-token",
            "started": false,
            "phase": "WAIT",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Alice",
                    "points": 100,
                    "streak": 3,
                },
                {
                    "id": "p2",
                    "clientId": "c2",
                    "connected": true,
                    "username": "Bob",
                    "points": 50,
                    "streak": 1,
                },
            ],
            "playerTokens": {
                "p1": "token-alice-secret",
                "p2": "token-bob-secret",
            },
            "autoMode": false,
            "currentQuestionIndex": 0,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore game");

        let p1 = restored
            .players
            .iter()
            .find(|p| p.id == "p1")
            .expect("Player p1 not found");
        assert_eq!(
            p1.player_token,
            Some("token-alice-secret".to_string()),
            "p1 token mismatch"
        );

        let p2 = restored
            .players
            .iter()
            .find(|p| p.id == "p2")
            .expect("Player p2 not found");
        assert_eq!(
            p2.player_token,
            Some("token-bob-secret".to_string()),
            "p2 token mismatch"
        );
    }

    /// Test that Player wire serialization does NOT include playerToken (security regression guard).
    #[test]
    fn test_player_wire_no_token_leak() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-1",
            "managerClientId": "mgr-client",
            "hostToken": "host-token",
            "started": false,
            "phase": "WAIT",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Alice",
                    "points": 100,
                    "streak": 3,
                }
            ],
            "playerTokens": {
                "p1": "token-alice"
            },
            "autoMode": false,
            "currentQuestionIndex": 0,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore");
        let p1 = restored
            .players
            .iter()
            .find(|p| p.id == "p1")
            .expect("Player p1 not found");

        assert_eq!(p1.player_token, Some("token-alice".to_string()));

        let player_json = serde_json::to_value(p1).unwrap();
        assert!(
            player_json.get("playerToken").is_none(),
            "Token leaked in wire serialization"
        );
    }

    /// Test that engine.phase is restored correctly.
    /// WP-M Fix 2 validation: Phase must survive round-trip and follow resume semantics.
    #[test]
    fn test_snapshot_phase_restoration() {
        let test_cases = vec![
            ("WAIT", GamePhase::ShowRoom, false),
            ("FINISHED", GamePhase::Finished, true),
            ("SHOW_QUESTION", GamePhase::ShowLeaderboard, true),
            ("SELECT_ANSWER", GamePhase::ShowLeaderboard, true),
            ("SHOW_RESULT", GamePhase::ShowLeaderboard, true),
            ("SHOW_ROUND_RECAP", GamePhase::ShowLeaderboard, true),
            ("SHOW_LEADERBOARD", GamePhase::ShowLeaderboard, true),
        ];

        for (phase_str, expected_phase, started) in test_cases {
            let snap = serde_json::json!({
                "gameId": "game-1",
                "inviteCode": "invite-1",
                "managerClientId": null,
                "hostToken": "host-token",
                "started": started,
                "phase": phase_str,
                "quizz": {
                    "subject": "Test",
                    "questions": []
                },
                "quizId": "quiz-1",
                "lowLatencyConfig": {"enabled": false},
                "players": [],
                "playerTokens": {},
                "autoMode": false,
                "currentQuestionIndex": 0,
            });

            let restored = game_from_snapshot(&snap)
                .unwrap_or_else(|| panic!("Failed to restore phase {}", phase_str));
            assert_eq!(
                restored.engine.phase, expected_phase,
                "Phase mismatch for '{}'",
                phase_str
            );
        }
    }

    /// Test that currentQuestionIndex is preserved through round-trip.
    #[test]
    fn test_snapshot_current_question_index() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-1",
            "managerClientId": null,
            "hostToken": "host-token",
            "started": true,
            "phase": "SELECT_ANSWER",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [],
            "playerTokens": {},
            "autoMode": false,
            "currentQuestionIndex": 3,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore");
        assert_eq!(
            restored.engine.current_question_index, 3,
            "currentQuestionIndex not preserved"
        );
    }

    /// Integration test: Snapshot round-trip with multi-player state.
    #[test]
    fn test_snapshot_integration_multiplay() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-xyz",
            "managerClientId": "mgr-client",
            "hostToken": "host-secret",
            "started": true,
            "phase": "SELECT_ANSWER",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Alice",
                    "points": 100,
                    "streak": 3,
                },
                {
                    "id": "p2",
                    "clientId": "c2",
                    "connected": true,
                    "username": "Bob",
                    "points": 50,
                    "streak": 1,
                },
            ],
            "playerTokens": {
                "p1": "token-alice-secret",
                "p2": "token-bob-secret",
            },
            "autoMode": false,
            "currentQuestionIndex": 3,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore");

        assert_eq!(restored.players.len(), 2);
        let p1 = restored.players.iter().find(|p| p.id == "p1").unwrap();
        let p2 = restored.players.iter().find(|p| p.id == "p2").unwrap();

        assert_eq!(p1.player_token, Some("token-alice-secret".to_string()));
        assert_eq!(p2.player_token, Some("token-bob-secret".to_string()));
        assert_eq!(restored.engine.phase, GamePhase::ShowLeaderboard);
        assert_eq!(restored.engine.current_question_index, 3);
    }

    /// BLOCKER #12: the resume plan derived from the raw snapshot must classify
    /// pre-reveal phases as "replay the in-flight question" and post-reveal
    /// phases as "advance past it" (or finish, when it was the last).
    #[test]
    fn test_resume_plan_classification() {
        let snap = |phase: &str, idx: u64, num_q: usize, started: bool| {
            let questions: Vec<serde_json::Value> = (0..num_q)
                .map(|_| serde_json::json!({"question": "q", "answers": [], "time": 10}))
                .collect();
            serde_json::json!({
                "gameId": "game-1",
                "started": started,
                "phase": phase,
                "quizz": {"subject": "S", "questions": questions},
                "currentQuestionIndex": idx,
            })
        };

        // Lobby / finished / not-started → no resume.
        assert_eq!(resume_plan_from_snapshot(&snap("WAIT", 0, 3, false)), None);
        assert_eq!(
            resume_plan_from_snapshot(&snap("FINISHED", 2, 3, true)),
            None
        );

        // Pre-reveal → replay the current question (start_index == index).
        for phase in ["SHOW_START", "SHOW_QUESTION", "SELECT_ANSWER"] {
            assert_eq!(
                resume_plan_from_snapshot(&snap(phase, 1, 3, true)),
                Some(ResumePlan {
                    game_id: "game-1".into(),
                    start_index: 1,
                    finish_now: false
                }),
                "pre-reveal phase {phase} must replay the in-flight question"
            );
        }

        // Post-reveal, not last → advance to the next question.
        for phase in ["SHOW_RESULT", "SHOW_ROUND_RECAP", "SHOW_LEADERBOARD"] {
            assert_eq!(
                resume_plan_from_snapshot(&snap(phase, 1, 3, true)),
                Some(ResumePlan {
                    game_id: "game-1".into(),
                    start_index: 2,
                    finish_now: false
                }),
                "post-reveal phase {phase} must advance past the scored question"
            );
        }

        // Post-reveal on the LAST question → finish, never re-open/double-count.
        assert_eq!(
            resume_plan_from_snapshot(&snap("SHOW_RESULT", 2, 3, true)),
            Some(ResumePlan {
                game_id: "game-1".into(),
                start_index: 2,
                finish_now: true
            })
        );
    }

    /// W1-1 New Test: Roundtrip with in-flight answers mid-question.
    /// This tests the critical functionality added in Commit 1: persisting and
    /// restoring current_answers during SELECT_ANSWER phase with an active question.
    /// P1-Bug validation: Crash mid-SELECT_ANSWER with player submissions → Restore keeps answers intact.
    #[test]
    fn test_snapshot_roundtrip_answers_mid_question() {
        // Full snapshot with a real question mid-SELECT_ANSWER
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-xyz",
            "managerClientId": "mgr-client",
            "hostToken": "host-secret",
            "started": true,
            "phase": "SELECT_ANSWER",
            "quizz": {
                "subject": "Test Quiz",
                "questions": [
                    {
                        "question": "What is 2+2?",
                        "answers": ["3", "4", "5"],
                        "cooldown": 0,
                        "time": 10
                    }
                ]
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Alice",
                    "points": 100,
                    "streak": 3,
                },
                {
                    "id": "p2",
                    "clientId": "c2",
                    "connected": true,
                    "username": "Bob",
                    "points": 50,
                    "streak": 1,
                },
            ],
            "playerTokens": {
                "p1": "token-alice-secret",
                "p2": "token-bob-secret",
            },
            "autoMode": false,
            "currentQuestionIndex": 0,
            // W1-1: In-flight answers mid-SELECT_ANSWER (the P1-Bug scenario)
            "currentAnswers": [
                {
                    "clientId": "c1",
                    "answerInput": {"answerKey": 1},
                    "responseTimeMs": 500
                },
                {
                    "clientId": "c2",
                    "answerInput": {"answerKey": 0},
                    "responseTimeMs": 800
                }
            ],
            "answerOrder": ["c1", "c2"],
            "recapStats": {},
            "questionStats": {},
            "questionsHistory": []
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore interrupted game");

        // Verify the in-flight answers were restored (P1 bug fix validation)
        assert_eq!(
            restored.engine.current_answers.len(),
            2,
            "Should have 2 in-flight answers"
        );
        assert!(
            restored.engine.current_answers.contains_key("c1"),
            "Answer from c1 missing"
        );
        assert!(
            restored.engine.current_answers.contains_key("c2"),
            "Answer from c2 missing"
        );

        // Verify answer order was restored
        assert_eq!(
            restored.engine.answer_order.len(),
            2,
            "Should have 2 answers in order"
        );
        assert_eq!(
            restored.engine.answer_order[0], "c1",
            "First answer order incorrect"
        );
        assert_eq!(
            restored.engine.answer_order[1], "c2",
            "Second answer order incorrect"
        );

        // Verify the active question is intact
        assert_eq!(
            restored.engine.current_question_index, 0,
            "Question index mismatch"
        );
        assert_eq!(
            restored.engine.quiz.questions.len(),
            1,
            "Question count mismatch"
        );
    }

    /// W1-1 New Test: Backward compatibility with old snapshots (version 1).
    /// Old snapshots without the new fields should restore gracefully with defaults.
    #[test]
    fn test_snapshot_backward_compat_old_snapshot() {
        // Simulate a version 1 snapshot without in-flight answer data
        // Based on the working test_snapshot_integration_multiplay structure
        let snap = serde_json::json!({
            "gameId": "old-game",
            "inviteCode": "old-invite",
            "managerClientId": "mgr-old",
            "hostToken": "old-token",
            "started": true,
            "phase": "SELECT_ANSWER",
            "quizz": {
                "subject": "Old Quiz",
                "questions": []
            },
            "quizId": "quiz-old",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Player",
                    "points": 10,
                    "streak": 1
                }
            ],
            "playerTokens": {"p1": "token-old"},
            "autoMode": false,
            "currentQuestionIndex": 0
            // NOTE: Missing currentAnswers, answerOrder, recapStats, questionStats, questionsHistory
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore old snapshot");

        // Verify basic restoration
        assert_eq!(restored.game_id, "old-game");
        assert_eq!(restored.players.len(), 1);

        // Verify new fields have sensible defaults
        assert_eq!(
            restored.engine.current_answers.len(),
            0,
            "Old snapshot should have empty current_answers"
        );
        assert_eq!(
            restored.engine.answer_order.len(),
            0,
            "Old snapshot should have empty answer_order"
        );
        assert_eq!(
            restored.engine.recap_stats.len(),
            0,
            "Old snapshot should have empty recap_stats"
        );
        assert_eq!(
            restored.engine.question_stats.len(),
            0,
            "Old snapshot should have empty question_stats"
        );
        assert_eq!(
            restored.engine.questions_history.len(),
            0,
            "Old snapshot should have empty questions_history"
        );
    }

    /// WP #933: SNAPSHOT_VERSION is 6 (offers + sun + winners; #932 was 5).
    #[test]
    fn test_snapshot_version_is_6() {
        assert_eq!(SNAPSHOT_VERSION, 6, "SNAPSHOT_VERSION must be 6");
    }

    /// WP #932: activeEffects survive roundtrip; v4-shaped snaps restore empty.
    #[test]
    fn test_active_effects_snapshot_roundtrip() {
        use razzoozle_engine::flower_battle::{apply_effects, EffectsState, OfferedEffect};
        use razzoozle_protocol::quizz::Quizz;

        let empty_quiz = Quizz {
            subject: "Fx".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let mut game = Game::new(
            "game-fx-rt".to_string(),
            "INVFX".to_string(),
            "mgr".to_string(),
            "quiz".to_string(),
            empty_quiz,
        );
        let mut fx = EffectsState::new();
        apply_effects(&mut fx, "red", OfferedEffect::Sunbeam, "o1").unwrap();
        apply_effects(&mut fx, "blue", OfferedEffect::UmbrellaShield, "o2").unwrap();
        apply_effects(
            &mut fx,
            "red",
            OfferedEffect::AcidRain {
                target_team_id: "blue".into(),
            },
            "o3",
        )
        .unwrap();
        fx.growth_stage.insert("red".into(), 4);
        game.flower_battle_effects = fx;

        let snap = game_to_snapshot(&game);
        assert!(
            snap.get("activeEffects").is_some(),
            "activeEffects must be present in v5 snapshot"
        );
        let restored = game_from_snapshot(&snap).expect("restore");
        assert_eq!(
            restored
                .flower_battle_effects
                .active
                .get("red")
                .map(|v| v.len()),
            Some(1),
            "sunbeam on red"
        );
        assert_eq!(
            restored
                .flower_battle_effects
                .active
                .get("blue")
                .map(|v| v.len()),
            Some(2),
            "umbrella + acid on blue"
        );
        assert_eq!(restored.flower_battle_effects.growth_of("red"), 4);
        assert!(restored
            .flower_battle_effects
            .applied_offers
            .contains_key("o1"));

        // Defensive: drop activeEffects (simulates v4 snapshot) → empty
        let mut v4_like = snap.clone();
        v4_like.as_object_mut().map(|o| o.remove("activeEffects"));
        let restored_v4 = game_from_snapshot(&v4_like).expect("restore v4-like");
        assert!(
            restored_v4.flower_battle_effects.active.is_empty(),
            "v4 snap must restore empty activeEffects"
        );
        assert!(restored_v4.flower_battle_effects.growth_stage.is_empty());
    }

    /// WP #878: experience_mode survives snapshot roundtrip; v2-shaped snaps restore as None.
    #[test]
    fn test_experience_mode_snapshot_roundtrip() {
        use razzoozle_protocol::game::{ExperienceMode, SelectedModes};
        use razzoozle_protocol::quizz::Quizz;

        let empty_quiz = Quizz {
            subject: "Exp".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let mut game = Game::new(
            "game-exp-rt".to_string(),
            "INVEXP".to_string(),
            "mgr".to_string(),
            "quiz".to_string(),
            empty_quiz,
        );
        game.selected_modes = SelectedModes {
            scoring_mode: Some("speed".to_string()),
            team_mode: Some(true),
            klassen: None,
            end_screen: None,
            participant_cap: None,
            experience_mode: Some(ExperienceMode::PyramidClimb),
            team_assignment: Default::default(),
        };

        let snap = game_to_snapshot(&game);
        assert_eq!(
            snap.get("selectedModes")
                .and_then(|m| m.get("experienceMode"))
                .and_then(|v| v.as_str()),
            Some("pyramidClimb")
        );
        let restored = game_from_snapshot(&snap).expect("restore");
        assert_eq!(
            restored.selected_modes.experience_mode,
            Some(ExperienceMode::PyramidClimb)
        );

        // Defensive: drop experienceMode (simulates v2 snapshot) → None
        let mut v2_like = snap.clone();
        if let Some(modes) = v2_like.get_mut("selectedModes") {
            modes.as_object_mut().map(|o| o.remove("experienceMode"));
        }
        let restored_v2 = game_from_snapshot(&v2_like).expect("restore v2-like");
        assert_eq!(restored_v2.selected_modes.experience_mode, None);
    }
}
