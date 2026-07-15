//! lifecycle.rs — the game-lifecycle driver (R3/R4/R5): one long-lived task per
//! game that owns every question's cooldown ticker, reveal, leaderboard and
//! auto-advance to the next question, all the way to FINISHED.
//!
//! Node reference: `round-manager.ts` `start()` / `newQuestion()` /
//! `showResults()` / `showLeaderboard()` + `cooldown-timer.ts`.
//!
//! Why one task instead of per-handler emits (the previous, flaky shape):
//! `manager:startGame` used to spawn a one-shot task that opened Q1 and then
//! did NOTHING — no timer ever drove the game forward, and
//! `manager:skipQuestion` / `manager:nextQuestion` each independently
//! re-implemented "open next question", racing on the same engine phase guard.
//! Here every phase transition happens in exactly ONE place (this loop); the
//! manager handlers (`game_flow.rs`, `game_state.rs`) and the all-answered
//! path (`player.rs`) merely *signal* the abort handle to cut the current wait
//! short — the loop itself performs the transition exactly once, using the
//! engine's phase guards (see `razzoozle_engine::state::GameState`) as the
//! race-safety net for "timer elapsed vs. skip vs. all-answered".

use crate::db;
use uuid::Uuid;
use crate::state::{Game, GameRegistry};
use crate::question_type_wire;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::game::GameUpdateQuestion;
use razzoozle_protocol::quizz::Question;
use razzoozle_protocol::status::{
    FinishedData, GameStatus, SelectAnswerData, ShowPreparedData, ShowRoundRecapData,
};
use socketioxide::SocketIo;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{Notify, RwLock};
use tracing::{info, warn};

use super::cooldown::{run_cooldown, run_cooldown_with_deadline};
use super::reveal_helpers::perform_reveal_and_broadcast;
use super::status_emit::{broadcast_status, send_status_to_manager};
use super::status_emit::emit_plugin_lifecycle;

pub(crate) mod payloads;
pub(crate) use payloads::build_select_answer_data;
pub(crate) mod timing;
pub use timing::request_abort;
pub(crate) use timing::{dwell_auto_or_manual, wait_while_paused};

/// 3-2-1 intro before Q1 (node: `io.emit(START_COOLDOWN)` + `cooldown.start(3)`).
const INTRO_COOLDOWN_SECS: i32 = 3;
/// Dwell on the reveal (SHOW_RESULT/SHOW_RESPONSES) screen before the leaderboard.
const RESULT_DWELL_SECS: i32 = 6;
/// Dwell on SHOW_LEADERBOARD before auto-advancing to the next question.
const LEADERBOARD_DWELL_SECS: i32 = 5;
/// Brief "Question N of M" screen shown after SHOW_PREPARED, before SHOW_QUESTION
/// (node: `await sleep(2)` in `newQuestion()`).
const PREPARED_DWELL_SECS: u64 = 2;

/// Open question `index`: transitions the engine ShowStart/ShowLeaderboard ->
/// ShowQuestion -> SelectAnswer, emitting UPDATE_QUESTION, SHOW_PREPARED,
/// SHOW_QUESTION and SELECT_ANSWER in that order (node `newQuestion()`).
/// Returns `false` if the engine rejected the transition (index out of range,
/// or the game already moved on via a different path) — the caller should stop.
async fn open_question(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    index: usize,
) -> bool {
    let show_data = {
        let mut game = game_ref.lock().unwrap();
        // `next_or_finish()` (engine/state.rs) already performs the exact
        // ShowLeaderboard -> ShowQuestion transition for `index` when advancing
        // past a question's leaderboard, BEFORE the driver loop gets back here.
        // Calling `show_question(index)` again in that case is rejected by its
        // own phase guard (it only accepts ShowStart/ShowLeaderboard) — that Err
        // used to be swallowed silently, killing the whole lifecycle task right
        // as it tried to open the SECOND question (the reported "dies after
        // reveal, SHOW_LEADERBOARD/next question never arrives" bug). If the
        // engine is already sitting on this exact question, just read its data
        // instead of re-transitioning.
        if game.engine.phase == GamePhase::ShowQuestion
            && game.engine.current_question_index == index
        {
            game.engine.current_show_question_data()
        } else {
            match game.engine.show_question(index) {
                Ok(d) => d,
                Err(e) => {
                    warn!(
                        "Lifecycle stopping: show_question({}) rejected for gameId={}: {}",
                        index, game_id, e
                    );
                    return false;
                }
            }
        }
    };

    let (current, total, total_answers, question_type) = {
        let game = game_ref.lock().unwrap();
        let question = game.engine.current_question();
        (
            game.engine.current_question_index as i32 + 1,
            game.engine.quiz.questions.len() as i32,
            question.answers.as_ref().map(|a| a.len()).unwrap_or(0) as i32,
            question
                .r#type
                .as_ref()
                .map(|t| question_type_wire(t).to_string()),
        )
    };

    io.to(game_id.to_string())
        .emit(
            constants::game::UPDATE_QUESTION,
            &GameUpdateQuestion { current, total },
        )
        .ok();
    let prepared_status = GameStatus::ShowPrepared(ShowPreparedData {
        total_answers,
        question_number: current,
        question_type,
    });
    broadcast_status(io, game_ref, game_id, &prepared_status);

    tokio::time::sleep(Duration::from_secs(PREPARED_DWELL_SECS)).await;

    let show_question_status = GameStatus::ShowQuestion(show_data);
    broadcast_status(io, game_ref, game_id, &show_question_status);
    emit_plugin_lifecycle(&io, &game_id, "onQuestionShown", "SHOW_QUESTION");

    let (question, total_players, server_now_ms, deadline_ms, server_seq, shuffled_chunks) = {
        let mut game = game_ref.lock().unwrap();
        let server_now_ms = timing::now_ms();
        game.engine.set_clock_ms(server_now_ms);
        let _ = game.engine.open_answers();
        let question = game.engine.current_question().clone();
        let total_players = game.players.len() as i32;
        let deadline_ms = server_now_ms + question.time as i64 * 1000;
        game.deadline_ms = deadline_ms;
        game.question_start_at_server_ms = server_now_ms;
        // Internal tick-loop deadline on tokio's clock (see field doc on
        // `Game::deadline_instant`) — kept in lockstep with `deadline_ms` but
        // computed independently so it tracks tokio's (possibly virtual/paused)
        // time instead of wall-clock `SystemTime`.
        game.deadline_instant =
            Some(tokio::time::Instant::now() + Duration::from_secs(question.time.max(0) as u64));
        game.last_show_result_data.clear();
        let server_seq = if game.low_latency {
            game.server_seq += 1;
            Some(game.server_seq)
        } else {
            None
        };
        // Shuffle chunks for sentence-builder questions
        let shuffled = if question.r#type.as_ref().map(|t| question_type_wire(t)) == Some("sentence-builder") {
            if let Some(chunks) = &question.chunks {
                let shuffled = payloads::shuffle_chunks_with_guard(chunks.clone());
                game.shuffled_chunks = Some(shuffled.clone());
                Some(shuffled)
            } else {
                None
            }
        } else {
            game.shuffled_chunks = None;
            None
        };
        (question, total_players, server_now_ms, deadline_ms, server_seq, shuffled)
    };

    let select_data = build_select_answer_data(
        &question,
        total_players,
        server_now_ms,
        server_now_ms,
        deadline_ms,
        server_seq,
        shuffled_chunks,
    );
    let select_status = GameStatus::SelectAnswer(select_data);
    broadcast_status(io, game_ref, game_id, &select_status);

    let (bot_manager, bots) = {
        let game = game_ref.lock().unwrap();
        let bots: Vec<_> = game
            .players
            .iter()
            .filter(|p| p.is_bot == Some(true))
            .cloned()
            .collect();
        (game.bot_manager.clone(), bots)
    };
    if let Some(bm) = bot_manager {
        if !bots.is_empty() {
            let bm_clone = bm.clone();
            let game_arc = game_ref.clone();
            let io_clone = io.clone();
            let gid = game_id.to_string();
            let question_clone = question.clone();
            tokio::spawn(async move {
                bm_clone
                    .schedule_answers(gid, bots, question_clone, game_arc, io_clone)
                    .await;
            });
        }
    }

    true
}

/// Entry point, spawned once by `manager:startGame` after SHOW_START. Runs the
/// pre-Q1 3-2-1 intro, then loops: open question -> per-question cooldown ->
/// reveal -> result dwell -> leaderboard -> leaderboard dwell -> next question
/// (or FINISHED). Every abortable wait here can be cut short by a manager
/// live-control or the all-answered path signalling `Game::signal_abort`.
pub async fn run_game_lifecycle(
    io: SocketIo,
    registry: Arc<RwLock<GameRegistry>>,
    game_id: String,
    db_pool: Option<sqlx::PgPool>,
) {
    // Fresh start: run the 3-2-1 intro, then play from question 0.
    run_lifecycle_from(io, registry, game_id, db_pool, 0, true).await;
}

/// Shared driver behind BOTH the fresh start (`run_game_lifecycle`: 3-2-1 intro,
/// index 0) and crash-recovery resume (`resume_game_lifecycle`: no intro,
/// restored index). `run_intro` gates the pre-Q1 cooldown; `start_index` is the
/// question the loop opens first. Everything from `open_question` onward is
/// identical for both paths.
async fn run_lifecycle_from(
    io: SocketIo,
    registry: Arc<RwLock<GameRegistry>>,
    game_id: String,
    db_pool: Option<sqlx::PgPool>,
    start_index: usize,
    run_intro: bool,
) {
    let game_ref = {
        let reg = registry.read().await;
        match reg.get_game_by_id(&game_id) {
            Some(g) => g,
            None => return,
        }
    };

    if run_intro {
        // Pre-Q1 3-2-1 intro (node: game:startCooldown then cooldown.start(3)).
        io.to(game_id.clone())
            .emit(constants::game::START_COOLDOWN, &())
            .ok();
        let intro_abort = { game_ref.lock().unwrap().arm_abort() };
        let io_intro = io.clone();
        let gid_intro = game_id.clone();
        run_cooldown(INTRO_COOLDOWN_SECS, intro_abort, move |count| {
            io_intro
                .to(gid_intro.clone())
                .emit(constants::game::COOLDOWN, &count)
                .ok();
        })
        .await;
    }

    let mut index = start_index;

    loop {
        if !open_question(&io, &game_ref, &game_id, index).await {
            return;
        }

        // Per-question SELECT_ANSWER cooldown — the server clock driving the
        // countdown UI. Resolves at 0 (timeout) OR early via signal_abort
        // (manager:skipQuestion / manager:revealAnswer / all-answered).
        // FIX L105 (abort race): arm BEFORE cooldown to ensure signals after
        // open_answers() land on the correct Notify.
        let abort = { game_ref.lock().unwrap().arm_abort() };
        let seconds = { game_ref.lock().unwrap().engine.current_question().time };
        let game_ref_cooldown = game_ref.clone();
        let io_tick = io.clone();
        let gid_tick = game_id.clone();
        run_cooldown_with_deadline(
            seconds,
            abort,
            move |count| {
                io_tick
                    .to(gid_tick.clone())
                    .emit(constants::game::COOLDOWN, &count)
                    .ok();
            },
            move || {
                // Drive the tick loop off tokio's clock (`Game::remaining_answer_ms`),
                // NOT wall-clock `SystemTime`/`deadline_ms`: under `tokio::time::pause()`
                // (the whole test suite) `SystemTime::now()` never advances even as
                // virtual time does, so a wall-clock remaining-time computation here
                // would desync from the tick interval and the loop would spin/hang.
                // `deadline_ms` stays wall-clock — it's only for the client-facing
                // `answer_deadline_at_server_ms` payload field.
                let remaining_ms = game_ref_cooldown.lock().unwrap().remaining_answer_ms();
                (remaining_ms / 1000) as i32
            },
        )
        .await;

        {
            let bm = game_ref.lock().unwrap().bot_manager.clone();
            if let Some(bm) = bm {
                bm.cancel_pending(None).await;
            }
        }

        // FIX #9 (last-question showLeaderboard race): arm the RESULT-dwell abort
        // BEFORE the reveal flips the phase to ShowResult. `engine.reveal()` sets
        // ShowResult early, then `perform_reveal_and_broadcast` keeps broadcasting
        // SHOW_RESULT/SHOW_RESPONSES to every socket. A manager:showLeaderboard
        // firing anywhere in that window calls `request_abort(ShowResult)` — which
        // now matches the phase — and its `signal_abort()` must land on THIS Notify.
        // Arming AFTER the reveal (the old order) left `cooldown_abort` pointing at
        // the already-resolved SELECT_ANSWER Notify (no waiter), so the `notify_one`
        // was swallowed and the fresh dwell Notify never got it — the (manual-mode,
        // 3600s) result dwell then hung forever on the last question. Notify buffers
        // one permit, so a click landing before the dwell awaits still wakes it.
        let abort_result = { game_ref.lock().unwrap().arm_abort() };

        // Reveal now — safe to call regardless of WHY the wait ended (timeout,
        // skip, revealAnswer, all-answered): engine.reveal() is phase-guarded,
        // so a reveal already performed by a racing path is a silent no-op.
        info!("Question cooldown resolved: gameId={}, revealing", game_id);
        perform_reveal_and_broadcast(game_ref.clone(), game_id.clone(), io.clone(), true).await;

        // RESULT dwell: host betrachtet die Result-Screens (SHOW_RESULT/SHOW_RESPONSES)
        // before the leaderboard. The abort Notify was armed BEFORE the reveal
        // above, so no showLeaderboard signal can be lost in the reveal window.
        dwell_auto_or_manual(&game_ref, 3600, RESULT_DWELL_SECS, abort_result).await;

        // SHOW_ROUND_RECAP: per-round awards screen (manager-only), one per round except the last.
        // Inserted between RESULT dwell and SHOW_LEADERBOARD, executed only if temp_round_recap
        // is populated (done by reveal_helpers). After recap dwell, temp_round_recap is cleared.
        let should_show_recap = {
            let game = game_ref.lock().unwrap();
            let is_last_round = game.engine.current_question_index + 1 == game.engine.quiz.questions.len();
            !is_last_round && game.temp_round_recap.is_some() && !game.temp_round_recap.as_ref().unwrap().is_empty()
        };

        if should_show_recap {
            // Arm abort for the recap dwell
            let abort_recap = { game_ref.lock().unwrap().arm_abort() };

            // Set phase to ShowRoundRecap and emit to manager
            {
                let mut game = game_ref.lock().unwrap();
                game.engine.phase = GamePhase::ShowRoundRecap;
                game.last_show_result_data.clear();
                game.last_show_result_data.clear();
                let recap_data = game.temp_round_recap.clone().unwrap_or_default();
                let manager_socket_id = game.manager_socket_id.clone();
                drop(game);

                if let Ok(sid) = manager_socket_id.parse() {
                    if let Some(sock) = io.get_socket(sid) {
                        send_status_to_manager(
                            &sock,
                            &game_ref,
                            &GameStatus::ShowRoundRecap(ShowRoundRecapData {
                                round_recap: recap_data,
                            }),
                        );
                    }
                }
            }

            // Dwell on the recap screen (manual or auto mode)
            dwell_auto_or_manual(&game_ref, 3600, RESULT_DWELL_SECS, abort_recap).await;

            // WP-H gap 5: do NOT clear temp_round_recap here. Node's showLeaderboard()
            // still reads ctx.tempRoundRecap on the SECOND call (after the round-recap
            // diversion) to attach it to SHOW_LEADERBOARD (leaderboard-flow.ts:249-251),
            // only clearing it AFTER that emit (line 256). Clearing it here made it
            // None by the time the SHOW_LEADERBOARD block below reads it, so the
            // manager's leaderboard screen never carried roundRecap.
            {
                let mut game = game_ref.lock().unwrap();
                // Transition phase back to ShowResult so leaderboard_view() can proceed normally
                game.engine.phase = GamePhase::ShowResult;
            }
        }


        // Leaderboard-Notify VOR dem phase-flip armen (L105-Race:
        // ein request_abort der phase==ShowLeaderboard sieht, landet garantiert auf DIESEM Notify).
        let abort_leaderboard = { game_ref.lock().unwrap().arm_abort() };

        let (leaderboard_result, phase_after_leaderboard) = {
            let mut game = game_ref.lock().unwrap();
            let result = game.engine.leaderboard_view();
            let phase = game.engine.phase;
            (result, phase)
        };
        let leaderboard_data = match leaderboard_result {
            Ok(data) => data,
            Err(e) => {
                // Already advanced/finished via another path (e.g. manager:abortQuiz) — stop,
                // but LOUDLY: a silent return here is exactly what made past driver deaths
                // invisible in the logs.
                warn!(
                    "Lifecycle stopping before leaderboard: gameId={}, err={}",
                    game_id, e
                );
                return;
            }
        };

        // Last round: leaderboard_view() (engine/state.rs) already transitioned
        // straight to FINISHED (mirrors round-manager.ts showLeaderboard()
        // skipping the intermediate SHOW_LEADERBOARD screen on the last
        // question). Persist result and stop — no leaderboard dwell,
        // no next_or_finish() call (which would reject: phase is no longer
        // ShowLeaderboard).
        if phase_after_leaderboard == GamePhase::Finished {
            finish_and_broadcast(&io, &game_ref, &game_id, &db_pool).await;
            return;
        }

        // Emit SHOW_LEADERBOARD to manager socket only
        // Augment payload with auto_advance_ms and round_recap from Game state
        let (auto_advance_ms, round_recap_opt) = {
            let game = game_ref.lock().unwrap();
            let auto_ms = if game.auto_mode {
                Some((LEADERBOARD_DWELL_SECS as i32) * 1000)
            } else {
                None
            };
            let recap = game.temp_round_recap.clone();
            (auto_ms, recap)
        };

        let augmented_leaderboard_data = razzoozle_protocol::status::ShowLeaderboardData {
            old_leaderboard: leaderboard_data.old_leaderboard,
            leaderboard: leaderboard_data.leaderboard,
            team_standings: leaderboard_data.team_standings,
            auto_advance_ms,
            round_recap: round_recap_opt,
        };

        let manager_socket_id = game_ref.lock().unwrap().manager_socket_id.clone();
        if let Ok(sid) = manager_socket_id.parse() {
            if let Some(sock) = io.get_socket(sid) {
                send_status_to_manager(
                    &sock,
                    &game_ref,
                    &GameStatus::ShowLeaderboard(augmented_leaderboard_data),
                );
            }
        }
        emit_plugin_lifecycle(&io, &game_id, "onLeaderboard", "SHOW_LEADERBOARD");
        // Node parity (leaderboard-flow.ts:256): tempRoundRecap is cleared only
        // AFTER SHOW_LEADERBOARD has consumed it, so the round-recap dwell above
        // (which runs BEFORE this point) never sees it stale.
        game_ref.lock().unwrap().temp_round_recap = None;


        // Leaderboard dwell: host may cut it short via manager:nextQuestion.
        // Notify already armed before leaderboard_view() phase flip (L105-Race safe).
        dwell_auto_or_manual(&game_ref, 3600, LEADERBOARD_DWELL_SECS, abort_leaderboard).await;

        let next_phase = {
            let mut game = game_ref.lock().unwrap();
            game.engine.next_or_finish()
        };

        match next_phase {
            Ok(GamePhase::Finished) => {
                finish_and_broadcast(&io, &game_ref, &game_id, &db_pool).await;
                return;
            }
            Ok(GamePhase::ShowQuestion) => {
                index = game_ref.lock().unwrap().engine.current_question_index;
            }
            Ok(other) => {
                warn!(
                    "Lifecycle stopping: next_or_finish returned unexpected phase {:?} for gameId={}",
                    other, game_id
                );
                return;
            }
            Err(e) => {
                warn!(
                    "Lifecycle stopping: next_or_finish rejected for gameId={}: {}",
                    game_id, e
                );
                return;
            }
        }
    }
}

/// Persist the final result and broadcast FINISHED to the manager and every
/// player (personalized rank + own recap). Reached from both FINISHED sites in
/// the loop (leaderboard_view on the last round, and next_or_finish) and from
/// `resume_game_lifecycle` when a restart landed post-reveal on the last
/// question. Assumes `engine.phase == Finished` and the leaderboard order is
/// already settled in `engine.players`.
async fn finish_and_broadcast(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    db_pool: &Option<sqlx::PgPool>,
) {
    info!("Game finished: gameId={}", game_id);
    let (subject, players_json, quiz_id, owner_user_id) = {
        let game = game_ref.lock().unwrap();
        let players: Vec<razzoozle_protocol::results_display::GameResultPlayer> = {
            let mut sorted = game.engine.players.clone();
            sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
            sorted
                .iter()
                .enumerate()
                .map(|(idx, p)| razzoozle_protocol::results_display::GameResultPlayer {
                    username: p.username.clone(),
                    points: p.points,
                    rank: (idx + 1) as i32,
                })
                .collect()
        };
        (
            game.engine.quiz.subject.clone(),
            serde_json::to_value(&players).unwrap_or(serde_json::json!([])),
            Some(game.quiz_id.clone()),
            game.owner_user_id,
        )
    };

    // L104: Fire-and-forget result persistence (mirror Node's behavior)
    let (recap_json, questions_json) = {
        let game = game_ref.lock().unwrap();
        payloads::build_recap_and_questions(&game.engine)
    };
    let db = db_pool.clone();
    let gid = game_id.to_string();
    let questions_json_clone = questions_json.clone();
    let recap_json_clone = recap_json.clone();
    tokio::spawn(async move {
        let now = chrono::Utc::now();
        let rand8: String = Uuid::new_v4().simple().to_string().chars().take(8).collect();
        let result_id = format!("{}-{}", now.timestamp_millis(), rand8);
        if let Err(e) = db::insert_result(&db, &result_id, quiz_id.as_deref(), &subject, now, &players_json, Some(&questions_json_clone), recap_json_clone.as_ref(), owner_user_id).await {
            warn!("Result persistence failed for gameId={}: {}", gid, e);
        }
    });

    let finished = {
        let game = game_ref.lock().unwrap();
        payloads::build_finished_data(&game, recap_json.clone())
    };

    // Personalized FINISHED: send to manager with rank: None, then per-player with personalized rank
    let manager_socket_id = game_ref.lock().unwrap().manager_socket_id.clone();
    if let Ok(sid) = manager_socket_id.parse() {
        if let Some(sock) = io.get_socket(sid) {
            send_status_to_manager(&sock, game_ref, &GameStatus::Finished(finished.clone()));
        }
    }

    // Send personalized FINISHED data to each player (raw — not manager status)
    let game = game_ref.lock().unwrap();
    let sorted_players: Vec<_> = {
        let mut sorted = game.engine.players.clone();
        sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
        sorted
    };
    for (rank_idx, player) in sorted_players.iter().enumerate() {
        if let Some(player_info) = game.players.iter().find(|p| p.username == player.username) {
            // WP-H gap 1: players get their OWN recap (myRecap + highlight),
            // never the manager's superlatives list, and no autoMode key at
            // all (Node parity: leaderboard-flow.ts:225-231 — the player
            // FINISHED payload never carries autoMode).
            let player_recap = game
                .engine
                .build_player_recap(&player.client_id)
                .and_then(|r| serde_json::to_value(&r).ok());
            let personalized_finished = FinishedData {
                subject: finished.subject.clone(),
                top: finished.top.clone(),
                rank: Some((rank_idx + 1) as i32),
                team_standings: finished.team_standings.clone(),
                recap: player_recap,
                auto_mode: None,
                end_screen: finished.end_screen,
            };
            if let Ok(sid) = player_info.id.parse() {
                if let Some(sock) = io.get_socket(sid) {
                    sock.emit(constants::game::STATUS, &GameStatus::Finished(personalized_finished))
                        .ok();
                }
            }
        }
    }
    emit_plugin_lifecycle(io, game_id, "onGameEnd", "FINISHED");
}

/// Crash-recovery entry point (BLOCKER #12): re-spawn the per-game lifecycle for
/// a game restored from a snapshot mid-flight, so a mid-question restart (every
/// CD deploy) doesn't brick it. Unlike a naive `run_game_lifecycle` respawn
/// (which restarts from the 3-2-1 intro at question 0), this uses the
/// snapshot-derived `ResumePlan` to resume at the RIGHT question — see
/// `resume_plan_from_snapshot` for the pre-/post-reveal classification.
pub async fn resume_game_lifecycle(
    io: SocketIo,
    registry: Arc<RwLock<GameRegistry>>,
    plan: crate::state::snapshot::ResumePlan,
    db_pool: Option<sqlx::PgPool>,
) {
    if plan.finish_now {
        // Post-reveal on the last question: the game is effectively over —
        // drive straight to FINISHED instead of re-opening/double-counting it.
        let game_ref = {
            let reg = registry.read().await;
            match reg.get_game_by_id(&plan.game_id) {
                Some(g) => g,
                None => return,
            }
        };
        {
            let mut game = game_ref.lock().unwrap();
            game.engine.phase = GamePhase::Finished;
        }
        info!(
            "Resuming restored game straight to FINISHED (post-reveal on last question): gameId={}",
            plan.game_id
        );
        finish_and_broadcast(&io, &game_ref, &plan.game_id, &db_pool).await;
        return;
    }

    info!(
        "Resuming restored game lifecycle: gameId={}, startIndex={}",
        plan.game_id, plan.start_index
    );
    run_lifecycle_from(io, registry, plan.game_id, db_pool, plan.start_index, false).await;
}


#[cfg(test)]
mod tests;
