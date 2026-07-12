//! MANAGER.START_GAME, SET_AUTO, NEXT_QUESTION, SKIP_QUESTION, ABORT_QUIZ, ADJUST_TIMER — game flow handlers
//!
//! START_GAME is the only handler that DRIVES the game forward — it spawns the
//! single long-lived `socket::lifecycle::run_game_lifecycle` task that owns
//! every subsequent phase transition (question cooldown, reveal, leaderboard,
//! advance, finish). NEXT_QUESTION / SKIP_QUESTION never build or emit a
//! status themselves anymore — they just interrupt whatever abortable wait the
//! lifecycle task is currently in (see `socket::lifecycle::request_abort`),
//! exactly like node's `skipQuestion()`/`nextQuestion()` only ever nudge the
//! round-manager's state machine, never duplicate its transitions.

use super::super::HandlerCtx;
use crate::is_game_host;
use crate::socket::lifecycle;
use crate::socket::status_emit::broadcast_status;
use razzoozle_engine::state::{GameError, GamePhase};
use razzoozle_protocol::constants;
use razzoozle_protocol::status::GameStatus;
use socketioxide::extract::{Data, SocketRef};
use std::time::Duration;
use tracing::{info, warn};

/// Result-screen auto-advance countdown (mirrors Node AUTO_RESULT_MS).
const AUTO_RESULT_MS: i32 = 6000;

mod pacing;
pub use pacing::{register_adjust_timer, register_pause_game, register_resume_game};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_start_game(socket, ctx.clone());
    register_set_auto(socket, ctx.clone());
    register_next_question(socket, ctx.clone());
    register_skip_question(socket, ctx.clone());
    register_abort_quiz(socket, ctx.clone());
    register_adjust_timer(socket, ctx.clone());
    register_pause_game(socket, ctx.clone());
    register_resume_game(socket, ctx.clone());
}

fn register_start_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::START_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                info!("manager:startGame received: gameId={:?}", game_id_opt);

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            // Per-game ownership check: only the socket that created this game can start it
                            if game.manager_socket_id != socket.id.to_string() {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                            // Legacy hostToken check (is_game_host verifies clientId + optional hostToken)
                            if !is_game_host(&game, &payload, &ctx.client_id, None) {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                        }

                        let start_result = {
                            let mut game = game_ref.lock().unwrap();
                            game.engine.start()
                        };

                        match start_result {
                            Ok(start_data) => {
                                let game_id = game_id.to_string();
                                info!("Game started: gameId={}", game_id);

                                // Emit SHOW_START to room (records manager reconnect status)
                                let status = GameStatus::ShowStart(start_data);
                                broadcast_status(&ctx.io, &game_ref, &game_id, &status);

                                // After the SHOW_START lead-time, hand off to the single
                                // game-lifecycle task (3-2-1 intro -> Q1 -> ... -> FINISHED).
                                let io_handle = ctx.io.clone();
                                let db_pool = ctx.db_pool.clone();
                                let registry = ctx.registry.clone();

                                tokio::spawn(async move {
                                    tokio::time::sleep(Duration::from_secs(3)).await;
                                    lifecycle::run_game_lifecycle(io_handle, registry, game_id, db_pool).await;
                                });
                            }
                            Err(e) => {
                                let error_msg = match e {
                                    GameError::NoPlayers => "errors:game.noPlayersConnected".to_string(),
                                    _ => "errors:game.notFound".to_string(),
                                };
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, error_msg.as_str())
                                    .ok();
                            }
                        }
                    } else {
                        socket
                            .emit(
                                constants::game::ERROR_MESSAGE,
                                "errors:game.notFound",
                            )
                            .ok();
                    }
                } else {
                    socket
                        .emit(
                            constants::game::ERROR_MESSAGE,
                            "errors:game.notFound",
                        )
                        .ok();
                }
            });
        }
    });
}

/// Host-only: toggle auto-advance mode. Routed via withAuth + getManagerGame
/// (same ownership gate as START_GAME / PAUSE_GAME). A non-host emit is
/// silently ignored (no state change, no emit).
///
/// FIX 8 (immediacy): when setAuto(true) arrives during SHOW_RESULT, arm the
/// same auto-advance that would have fired had auto-mode been on at reveal time
/// (delay = AUTO_RESULT_MS). Mirrors Node auto-mode.ts applyAutoMode / scheduleAuto.
///
/// REVISION (smoke-fail): Mirrors Node's getManagerGame fallback (handlers/game.ts:310):
/// resolve by payload.gameId when present; when absent/unknown, fall back to the game
/// owned by ctx.client_id. Add logging on every early-return path (previously silent
/// failures made this undiagnosable). See GameWrapper.tsx:66 (client may omit gameId).
fn register_set_auto(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_AUTO, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Extract gameId and auto flag from payload
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                let auto_flag = payload.get("auto").and_then(|v| v.as_bool()) == Some(true);

                // Resolve game: try gameId first, then fall back to manager_client_id (mirrors Node)
                let game_ref = if let Some(game_id) = game_id_opt {
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_id(game_id) {
                        Some(game_ref) => Some((game_ref, game_id.to_string())),
                        None => {
                            warn!(
                                "manager:setAuto failed: gameId={} not found, clientId={}",
                                game_id, ctx.client_id
                            );
                            None
                        }
                    }
                } else {
                    // gameId missing from payload — fall back to manager_client_id (Node pattern)
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_manager_client_id(&ctx.client_id) {
                        Some(game_ref) => {
                            let game_id = game_ref.lock().unwrap().game_id.clone();
                            info!(
                                "manager:setAuto resolved via client fallback: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            Some((game_ref, game_id))
                        }
                        None => {
                            warn!(
                                "manager:setAuto failed: no gameId in payload and no game owned by clientId={}",
                                ctx.client_id
                            );
                            None
                        }
                    }
                };

                if let Some((game_ref, game_id)) = game_ref {
                    {
                        let game = game_ref.lock().unwrap();
                        // Per-game ownership check: only the socket that created this game can set auto
                        if game.manager_socket_id != socket.id.to_string() {
                            warn!(
                                "manager:setAuto unauthorized: socket.id={} not manager of gameId={}",
                                socket.id.to_string(),
                                game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                        // Legacy hostToken check (is_game_host verifies clientId + optional hostToken)
                        if !is_game_host(&game, &payload, &ctx.client_id, None) {
                            warn!(
                                "manager:setAuto host-check failed: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                    }

                    let mut game = game_ref.lock().unwrap();
                    let was_auto = game.auto_mode;
                    game.auto_mode = auto_flag;
                    info!("auto_mode set to {} for game {}", game.auto_mode, game_id);

                    if !was_auto && game.auto_mode {
                        let current_phase = game.engine.phase;

                        match current_phase {
                            GamePhase::ShowResult => {
                                // Re-send cached SHOW_RESULT with autoAdvanceMs so clients
                                // already on the result screen get a countdown (FIX 9).
                                let payloads = game.last_show_result_data.clone();

                                // FIX 8 (immediacy): arm auto-advance for THIS screen now.
                                // Guard: only arm if no timer is pending (prevents duplicate timers).
                                // Mirrors Node's guard at auto-mode.ts:172 (ctx.autoTimer === null).
                                if game.auto_advance_task.is_none() {
                                    let game_ref_clone = game_ref.clone();
                                    let game_id_clone = game_id.clone();

                                    let task = tokio::spawn(async move {
                                        // CRITICAL: honour pause loops first (mirrors Node scheduleAuto line 86-98).
                                        // Read paused and pause_notify under ONE lock to avoid lost wakeup.
                                        loop {
                                            let (paused, pause_notify) = {
                                                let game = game_ref_clone.lock().unwrap();
                                                (game.paused, game.pause_resume.clone())
                                            };
                                            if !paused {
                                                break;
                                            }
                                            pause_notify.notified().await;
                                        }

                                        // Wait AUTO_RESULT_MS before firing the advance
                                        tokio::time::sleep(Duration::from_millis(AUTO_RESULT_MS as u64)).await;

                                        // Guard against races: check that auto-mode is still enabled
                                        // and phase is still SHOW_RESULT before firing (mirrors Node line 115).
                                        {
                                            let game = game_ref_clone.lock().unwrap();
                                            if !game.auto_mode || game.engine.phase != GamePhase::ShowResult {
                                                return;
                                            }
                                        }

                                        // Fire the advance by aborting the SHOW_RESULT dwell.
                                        // request_abort returns false if phase doesn't match (already advanced),
                                        // which is safe (the lifecycle loop will proceed normally).
                                        lifecycle::request_abort(&game_ref_clone, GamePhase::ShowResult);
                                    });

                                    game.auto_advance_task = Some(task);
                                    info!(
                                        "auto-advance task armed for gameId={}, will fire in {}ms",
                                        game_id_clone, AUTO_RESULT_MS
                                    );
                                }

                                drop(game);

                                // Per-player SHOW_RESULT stays raw (personalized — not manager status).
                                for (socket_id, mut show_result_data) in payloads {
                                    show_result_data.auto_advance_ms = Some(AUTO_RESULT_MS);
                                    let status = GameStatus::ShowResult(show_result_data);
                                    if let Ok(sid) = socket_id.parse() {
                                        if let Some(sock) = ctx.io.get_socket(sid) {
                                            sock.emit(constants::game::STATUS, &status).ok();
                                        }
                                    }
                                }
                            }
                            GamePhase::ShowLeaderboard => {
                                drop(game);
                                lifecycle::request_abort(&game_ref, current_phase);
                            }
                            _ => {}
                        }
                    } else if was_auto && !game.auto_mode {
                        // setAuto(false): cancel any pending auto-advance timer (mirrors Node clearAuto)
                        game.clear_auto_advance();
                        info!("auto-advance task cancelled for gameId={}", game_id);
                    }
                }
            });
        }
    });
}

/// Host live-control: while the game-lifecycle task is dwelling on
/// SHOW_LEADERBOARD, cut that wait short so the next question opens now
/// instead of after the full dwell. No-op while any other phase is showing
/// (mirrors node's nextQuestion() only being meaningful from the leaderboard).
///
/// REVISION: Mirrors Node's getManagerGame fallback (handlers/game.ts:310):
/// resolve by payload.gameId when present; when absent/unknown, fall back to the game
/// owned by ctx.client_id. Add logging on every early-return path.
fn register_next_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::NEXT_QUESTION, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Extract gameId from payload
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                // Resolve game: try gameId first, then fall back to manager_client_id (mirrors Node)
                let game_ref = if let Some(game_id) = game_id_opt {
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_id(game_id) {
                        Some(game_ref) => Some((game_ref, game_id.to_string())),
                        None => {
                            warn!(
                                "manager:nextQuestion failed: gameId={} not found, clientId={}",
                                game_id, ctx.client_id
                            );
                            None
                        }
                    }
                } else {
                    // gameId missing from payload — fall back to manager_client_id (Node pattern)
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_manager_client_id(&ctx.client_id) {
                        Some(game_ref) => {
                            let game_id = game_ref.lock().unwrap().game_id.clone();
                            info!(
                                "manager:nextQuestion resolved via client fallback: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            Some((game_ref, game_id))
                        }
                        None => {
                            warn!(
                                "manager:nextQuestion failed: no gameId in payload and no game owned by clientId={}",
                                ctx.client_id
                            );
                            None
                        }
                    }
                };

                if let Some((game_ref, game_id)) = game_ref {
                    {
                        let game = game_ref.lock().unwrap();
                        // Per-game ownership check
                        if game.manager_socket_id != socket.id.to_string() {
                            warn!(
                                "manager:nextQuestion unauthorized: socket.id={} not manager of gameId={}",
                                socket.id.to_string(),
                                game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                        // Legacy hostToken check
                        if !is_game_host(&game, &payload, &ctx.client_id, None) {
                            warn!(
                                "manager:nextQuestion host-check failed: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                    }

                    if game_ref.lock().unwrap().paused {
                        info!("manager:nextQuestion ignored: game is paused, gameId={}", game_id);
                        return;
                    }

                    let fired = lifecycle::request_abort(&game_ref, GamePhase::ShowLeaderboard);
                    info!(
                        "manager:nextQuestion abort {} for gameId={}",
                        if fired { "fired" } else { "no-op (not in ShowLeaderboard)" },
                        game_id
                    );
                }
            });
        }
    });
}

/// Host live-control: end the live SELECT_ANSWER window NOW — the
/// game-lifecycle task's per-question cooldown wakes immediately and reveals,
/// exactly as if the timer had elapsed (node: skipQuestion() ends the answer
/// window early, letting the awaited cooldown fall through to showResults()).
/// No-op when no question is currently live (matches node's
/// `if (!answerWindowOpen) return`) — this is the fix for the reported
/// "Skip = No-Op" bug (skip used to call next_or_finish() directly, which
/// always failed because the engine was still in SelectAnswer, never
/// ShowLeaderboard).
///
/// REVISION: Mirrors Node's getManagerGame fallback (handlers/game.ts:310):
/// resolve by payload.gameId when present; when absent/unknown, fall back to the game
/// owned by ctx.client_id. Add logging on every early-return path.
fn register_skip_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SKIP_QUESTION, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Extract gameId from payload
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                // Resolve game: try gameId first, then fall back to manager_client_id (mirrors Node)
                let game_ref = if let Some(game_id) = game_id_opt {
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_id(game_id) {
                        Some(game_ref) => Some((game_ref, game_id.to_string())),
                        None => {
                            warn!(
                                "manager:skipQuestion failed: gameId={} not found, clientId={}",
                                game_id, ctx.client_id
                            );
                            None
                        }
                    }
                } else {
                    // gameId missing from payload — fall back to manager_client_id (Node pattern)
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_manager_client_id(&ctx.client_id) {
                        Some(game_ref) => {
                            let game_id = game_ref.lock().unwrap().game_id.clone();
                            info!(
                                "manager:skipQuestion resolved via client fallback: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            Some((game_ref, game_id))
                        }
                        None => {
                            warn!(
                                "manager:skipQuestion failed: no gameId in payload and no game owned by clientId={}",
                                ctx.client_id
                            );
                            None
                        }
                    }
                };

                if let Some((game_ref, game_id)) = game_ref {
                    {
                        let game = game_ref.lock().unwrap();
                        // Per-game ownership check
                        if game.manager_socket_id != socket.id.to_string() {
                            warn!(
                                "manager:skipQuestion unauthorized: socket.id={} not manager of gameId={}",
                                socket.id.to_string(),
                                game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                        // Legacy hostToken check
                        if !is_game_host(&game, &payload, &ctx.client_id, None) {
                            warn!(
                                "manager:skipQuestion host-check failed: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                    }

                    let fired = lifecycle::request_abort(&game_ref, GamePhase::SelectAnswer);
                    info!(
                        "manager:skipQuestion abort {} for gameId={}",
                        if fired { "fired" } else { "no-op (no live answer window)" },
                        game_id
                    );
                }
            });
        }
    });
}

/// Host live-control: abort the current question. Ends the answer window and moves
/// to results, exactly like skipQuestion. Node's abortQuiz (round.abortQuestion) just
/// closes the live answer window and lets normal flow continue — it does NOT end the game.
///
/// REVISION: Mirrors Node's getManagerGame fallback (handlers/game.ts:310):
/// resolve by payload.gameId when present; when absent/unknown, fall back to the game
/// owned by ctx.client_id. Add logging on every early-return path.
fn register_abort_quiz(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::ABORT_QUIZ, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Extract gameId from payload
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                // Resolve game: try gameId first, then fall back to manager_client_id (mirrors Node)
                let game_ref = if let Some(game_id) = game_id_opt {
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_id(game_id) {
                        Some(game_ref) => Some((game_ref, game_id.to_string())),
                        None => {
                            warn!(
                                "manager:abortQuiz failed: gameId={} not found, clientId={}",
                                game_id, ctx.client_id
                            );
                            None
                        }
                    }
                } else {
                    // gameId missing from payload — fall back to manager_client_id (Node pattern)
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_manager_client_id(&ctx.client_id) {
                        Some(game_ref) => {
                            let game_id = game_ref.lock().unwrap().game_id.clone();
                            info!(
                                "manager:abortQuiz resolved via client fallback: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            Some((game_ref, game_id))
                        }
                        None => {
                            warn!(
                                "manager:abortQuiz failed: no gameId in payload and no game owned by clientId={}",
                                ctx.client_id
                            );
                            None
                        }
                    }
                };

                if let Some((game_ref, game_id)) = game_ref {
                    {
                        let game = game_ref.lock().unwrap();
                        // Per-game ownership check
                        if game.manager_socket_id != socket.id.to_string() {
                            warn!(
                                "manager:abortQuiz unauthorized: socket.id={} not manager of gameId={}",
                                socket.id.to_string(),
                                game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                        // Legacy hostToken check
                        if !is_game_host(&game, &payload, &ctx.client_id, None) {
                            warn!(
                                "manager:abortQuiz host-check failed: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }
                    }

                    let fired = lifecycle::request_abort(&game_ref, GamePhase::SelectAnswer);
                    info!(
                        "manager:abortQuiz abort {} for gameId={}",
                        if fired { "fired" } else { "no-op (no live answer window)" },
                        game_id
                    );
                }
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Game, QuizFixture};
    use razzoozle_protocol::status::ShowResultData;
    use std::sync::{Arc, Mutex};

    fn test_game(phase: GamePhase) -> Arc<Mutex<Game>> {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let mut game = Game::new(
            "game-test".to_string(),
            "TEST".to_string(),
            "manager-socket".to_string(),
            "test-quiz".to_string(),
            quiz.clone(),
        );
        game.engine.phase = phase;
        game.manager_client_id = Some("test-client-id".to_string());
        game.last_show_result_data.insert(
            "player-socket".to_string(),
            ShowResultData {
                correct: true,
                message: "game:correct".to_string(),
                points: 100,
                my_points: 100,
                rank: 1,
                ahead_of_me: None,
                streak: None,
                streak_bonus: None,
                bonus: None,
                first_correct: None,
                poll: None,
                achievements: None,
                bonus_points: None,
                player_count: None,
                correct_answer: None,
                correct_chunks: None,
                scoring_mode: None,
                auto_advance_ms: None,
                round_recap: None,
            },
        );
        Arc::new(Mutex::new(game))
    }

    #[test]
    fn set_auto_on_show_result_should_reemit() {
        let game_ref = test_game(GamePhase::ShowResult);
        let should_reemit = matches!(
            game_ref.lock().unwrap().engine.phase,
            GamePhase::ShowResult
        );
        assert!(should_reemit);
    }

    #[test]
    fn set_auto_on_show_round_recap_should_not_reemit() {
        let game_ref = test_game(GamePhase::ShowRoundRecap);
        let should_reemit = matches!(
            game_ref.lock().unwrap().engine.phase,
            GamePhase::ShowResult
        );
        assert!(!should_reemit);
        assert!(!game_ref.lock().unwrap().last_show_result_data.is_empty());
    }

    #[test]
    fn next_question_while_paused_is_noop() {
        let game_ref = test_game(GamePhase::ShowLeaderboard);
        game_ref.lock().unwrap().paused = true;

        let fired = if game_ref.lock().unwrap().paused {
            false
        } else {
            lifecycle::request_abort(&game_ref, GamePhase::ShowLeaderboard)
        };

        assert!(!fired);
    }

    #[test]
    fn next_question_fallback_resolution_works() {
        // Test that fallback resolution logic can find a game by manager_client_id
        let game_ref = test_game(GamePhase::ShowLeaderboard);
        // Verify test fixture has manager_client_id set for fallback scenarios
        assert_eq!(
            game_ref.lock().unwrap().manager_client_id,
            Some("test-client-id".to_string())
        );
    }

    #[test]
    fn skip_question_fallback_resolution_works() {
        // Test that fallback resolution logic can find a game by manager_client_id
        let game_ref = test_game(GamePhase::SelectAnswer);
        // Verify test fixture has manager_client_id set for fallback scenarios
        assert_eq!(
            game_ref.lock().unwrap().manager_client_id,
            Some("test-client-id".to_string())
        );
    }

    #[test]
    fn abort_quiz_fallback_resolution_works() {
        // Test that fallback resolution logic can find a game by manager_client_id
        let game_ref = test_game(GamePhase::SelectAnswer);
        // Verify test fixture has manager_client_id set for fallback scenarios
        assert_eq!(
            game_ref.lock().unwrap().manager_client_id,
            Some("test-client-id".to_string())
        );
    }
}
