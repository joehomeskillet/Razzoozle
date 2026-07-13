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

/// 3-2-1 intro before Q1 (node: `io.emit(START_COOLDOWN)` + `cooldown.start(3)`).
const INTRO_COOLDOWN_SECS: i32 = 3;
/// Dwell on the reveal (SHOW_RESULT/SHOW_RESPONSES) screen before the leaderboard.
const RESULT_DWELL_SECS: i32 = 6;
/// Dwell on SHOW_LEADERBOARD before auto-advancing to the next question.
const LEADERBOARD_DWELL_SECS: i32 = 5;
/// Brief "Question N of M" screen shown after SHOW_PREPARED, before SHOW_QUESTION
/// (node: `await sleep(2)` in `newQuestion()`).
const PREPARED_DWELL_SECS: u64 = 2;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Shuffles chunks using Fisher-Yates, retrying up to 10 times
/// to ensure the result differs from the input order.
fn shuffle_chunks_with_guard(chunks: Vec<String>) -> Vec<String> {
    use rand::seq::SliceRandom;
    use rand::thread_rng;
    
    let is_equal = |a: &[String], b: &[String]| -> bool {
        if a.len() != b.len() {
            return false;
        }
        a.iter().zip(b.iter()).all(|(x, y)| x == y)
    };
    
    let mut rng = thread_rng();
    let mut shuffled = chunks.clone();
    let mut attempts = 0;
    
    while attempts < 10 && is_equal(&shuffled, &chunks) {
        shuffled.shuffle(&mut rng);
        attempts += 1;
    }
    
    shuffled
}


/// Host live-control: interrupt whatever abortable wait the lifecycle loop is
/// currently in, but ONLY when the game is actually in `expected_phase` — e.g.
/// skip/revealAnswer only act during a live SELECT_ANSWER window, matching
/// node's `if (!this.answerWindowOpen) return`. Returns whether it fired.
pub fn request_abort(game_ref: &Arc<Mutex<Game>>, expected_phase: GamePhase) -> bool {
    let game = game_ref.lock().unwrap();
    if game.engine.phase != expected_phase {
        return false;
    }
    game.signal_abort();
    true
}

async fn wait_abortable(seconds: i32, abort: Arc<Notify>) {
    tokio::select! {
        _ = abort.notified() => {}
        _ = tokio::time::sleep(Duration::from_secs(seconds.max(0) as u64)) => {}
    }
}

/// Suspend until the game is no longer paused (mirrors Node waitWhilePaused).
/// CRITICAL: read paused and clone Notify under ONE lock scope to avoid lost wakeup.
async fn wait_while_paused(game_ref: &Arc<Mutex<Game>>) {
    loop {
        let (paused, pause_notify) = {
            let game = game_ref.lock().unwrap();
            (game.paused, game.pause_resume.clone())
        };
        if !paused {
            break;
        }
        pause_notify.notified().await;
    }
}

/// Auto or manual dwell: ALWAYS honour pause loops first, then wait for dwell timeout.
async fn dwell_auto_or_manual(
    game_ref: &Arc<Mutex<Game>>,
    manual_secs: i32,
    auto_secs: i32,
    abort: Arc<Notify>,
) {
    // BOTH paths wait for pause to clear first
    wait_while_paused(game_ref).await;

    // Then dwell (manual or auto timeout)
    let seconds = if game_ref.lock().unwrap().auto_mode {
        auto_secs
    } else {
        manual_secs
    };
    wait_abortable(seconds, abort).await;
}

/// Builds a SELECT_ANSWER payload. `question_start_at_server_ms` is passed
/// separately from `server_now_ms` (rather than always being "now") so this
/// doubles as a resync builder: `manager:adjustTimer` (pacing.rs) re-emits this
/// with a fresh `server_now_ms`/`answer_deadline_at_server_ms` but the SAME,
/// original `question_start_at_server_ms` — clients need the true start moment
/// to keep rendering an accurate elapsed/total, not one that resets every time
/// the host nudges the timer.
pub(crate) fn build_select_answer_data(
    question: &Question,
    total_players: i32,
    server_now_ms: i64,
    question_start_at_server_ms: i64,
    deadline_ms: i64,
    server_seq: Option<i32>,

    shuffled_chunks: Option<Vec<String>>,
) -> SelectAnswerData {
    SelectAnswerData {
        question: question.question.clone(),
        answers: question.answers.clone(),
        media: question.media.clone(),
        time: question.time,
        total_player: total_players,
        question_type: question
            .r#type
            .as_ref()
            .map(|t| question_type_wire(t).to_string()),
        min: question.min.map(|v| v as i32),
        max: question.max.map(|v| v as i32),
        step: question.step.map(|v| v as i32),
        unit: question.unit.clone(),
        shuffled_chunks,
        server_seq,
        server_now_ms: Some(server_now_ms),
        question_start_at_server_ms: Some(question_start_at_server_ms),
        answer_deadline_at_server_ms: Some(deadline_ms),
        submitted_by: question.submitted_by.clone(),
    }
}

fn build_finished_data(game: &Game, recap_json: Option<serde_json::Value>) -> FinishedData {
    FinishedData {
        subject: game.engine.quiz.subject.clone(),
        top: {
            let mut sorted = game.engine.players.clone();
            sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
            sorted
        },
        rank: None,
        team_standings: None,
        recap: recap_json,
        auto_mode: Some(game.auto_mode),
    }
}

fn build_recap_and_questions(engine: &razzoozle_engine::state::GameState)
    -> (Option<serde_json::Value>, serde_json::Value) {
    let recap = engine.build_manager_recap();
    let recap_json = if recap.superlatives.is_empty() {
        None
    } else {
        serde_json::to_value(&recap).ok()
    };
    let questions_json =
        serde_json::to_value(&engine.questions_history).unwrap_or_else(|_| serde_json::json!([]));
    (recap_json, questions_json)
}

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
        let server_now_ms = now_ms();
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
                let shuffled = shuffle_chunks_with_guard(chunks.clone());
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
        build_recap_and_questions(&game.engine)
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
        build_finished_data(&game, recap_json.clone())
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
mod tests {
    use super::*;
    use crate::state::{Game, QuizFixture};

    /// Reproduces the reported "driver dies silently after reveal" bug end to
    /// end: drive a full game (fixture quiz, 1 player, nobody answers) through
    /// natural per-question cooldown timeouts and assert the task actually
    /// reaches FINISHED — i.e. every question's SHOW_LEADERBOARD/advance step
    /// ran — instead of hanging forever right after the reveal.
    #[tokio::test(start_paused = true)]
    async fn lifecycle_continues_past_reveal_to_leaderboard_and_finishes() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let mut registry = GameRegistry::new(&None, quiz.clone()).await;
        let mut quizzes = std::collections::HashMap::new();
        quizzes.insert("test-quiz".to_string(), quiz);
        registry.reload_quizzes(quizzes);
        let (game_id, _invite_code, _host_token) = registry
            .create_game(
                "manager-socket".to_string(),
                Some("test-quiz".to_string()),
                "manager-client-1".to_string(),
                None, false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
            .unwrap();

        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        {
            let mut game = game_ref.lock().unwrap();
            game.add_player(
                "player-socket".to_string(),
                "client-1".to_string(),
                "Alice".to_string(),
                None,
            )
            .unwrap();
            game.engine.start().unwrap();
            game.auto_mode = true; // Test uses auto-advance
        }

        let registry = Arc::new(RwLock::new(registry));
        let (_layer, io) = SocketIo::builder().build_layer();
        // `io.to(...).emit(...)` requires the default namespace to exist first
        // (mirrors main.rs's `io.ns("/", ...)`) — otherwise it panics instead of
        // being a harmless no-op broadcast to an empty room.
        io.ns("/", |_socket: socketioxide::extract::SocketRef| {});

        // Bounded so a genuine hang fails this test instead of blocking the whole
        // suite forever. Under `start_paused = true` this duration races the
        // driver's own dwells on the SAME virtual clock — it must comfortably
        // exceed the full 2-question walk (intro 3s + per question ~23s of
        // dwells) but a real deadlock/infinite-loop still burns real wall time
        // (caught by the test harness's own timeout) since paused time only
        // fast-forwards while every task is parked on a timer.
        let outcome = tokio::time::timeout(
            Duration::from_secs(120),
            run_game_lifecycle(io, registry, game_id.clone(), None),
        )
        .await;

        assert!(
            outcome.is_ok(),
            "run_game_lifecycle never returned — the driver died/hung after reveal"
        );

        let final_phase = game_ref.lock().unwrap().engine.phase;
        assert_eq!(
            final_phase,
            GamePhase::Finished,
            "lifecycle stalled before reaching FINISHED (leaderboard/advance never happened)"
        );
    }

    /// WP-H gap 5 regression: `temp_round_recap` must survive the
    /// SHOW_ROUND_RECAP dwell so the SHOW_LEADERBOARD augmentation right
    /// after `leaderboard_view()` can still read it (Node parity:
    /// leaderboard-flow.ts reads `ctx.tempRoundRecap` on send, only clearing
    /// it AFTER). Exercises the exact real functions
    /// `run_game_lifecycle` calls in this order (reveal -> [round-recap dwell,
    /// no longer clearing here] -> leaderboard_view) without racing the full
    /// async driver's internal timers.
    #[tokio::test(start_paused = true)]
    async fn temp_round_recap_survives_round_recap_dwell_for_leaderboard() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let mut registry = GameRegistry::new(&None, quiz.clone()).await;
        let mut quizzes = std::collections::HashMap::new();
        quizzes.insert("test-quiz".to_string(), quiz);
        registry.reload_quizzes(quizzes);
        let (game_id, _invite_code, _host_token) = registry
            .create_game(
                "manager-socket".to_string(),
                Some("test-quiz".to_string()),
                "manager-client-1".to_string(),
                None, false,
                serde_json::json!({"enabled": false, "clockSync": true}),
            )
            .unwrap();

        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        {
            let mut game = game_ref.lock().unwrap();
            game.add_player(
                "player-socket".to_string(),
                "client-1".to_string(),
                "Alice".to_string(),
                None,
            )
            .unwrap();
            game.engine.start().unwrap();
            game.engine.show_question(0).unwrap();
            game.engine.open_answers().unwrap();
            game.engine.set_clock_ms(500);
            // Fixture Q0 solutions:[1] — a lone correct answerer triggers the
            // round's fastest_finger recap award, so temp_round_recap is
            // non-empty after reveal.
            game.engine.record_answer("client-1", Some(1), None, None).unwrap();
        }

        let (_layer, io) = SocketIo::builder().build_layer();
        io.ns("/", |_socket: socketioxide::extract::SocketRef| {});

        // Real production reveal — populates game.temp_round_recap.
        perform_reveal_and_broadcast(game_ref.clone(), game_id.clone(), io.clone(), false).await;

        {
            let recap = game_ref.lock().unwrap().temp_round_recap.clone();
            assert!(
                recap.as_ref().is_some_and(|r| !r.is_empty()),
                "reveal should have populated a non-empty round recap (fastest_finger)"
            );
        }

        // Mirror the FIXED SHOW_ROUND_RECAP dwell block: it no longer clears
        // temp_round_recap here, only flips the phase back to ShowResult.
        {
            let mut game = game_ref.lock().unwrap();
            game.engine.phase = GamePhase::ShowResult;
        }

        // Mirror leaderboard_view() — the SHOW_LEADERBOARD augmentation in
        // lifecycle.rs reads temp_round_recap right after this call.
        {
            let mut game = game_ref.lock().unwrap();
            game.engine.leaderboard_view().unwrap();
        }

        let recap_at_leaderboard_time = game_ref.lock().unwrap().temp_round_recap.clone();
        assert!(
            recap_at_leaderboard_time.as_ref().is_some_and(|r| !r.is_empty()),
            "temp_round_recap must still be populated when SHOW_LEADERBOARD reads it \
             (WP-H gap 5 regression — was cleared prematurely by the \
             SHOW_ROUND_RECAP dwell block before this point)"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn pause_resume_wakes_dwell_without_deadlock() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let game = Game::new(
            "game-1".to_string(),
            "ABCD".to_string(),
            "manager-socket".to_string(),
            "test-quiz".to_string(),
            quiz.clone(),
        );
        let game_ref = Arc::new(Mutex::new({
            let mut g = game;
            g.paused = true;
            g
        }));

        let game_ref_waiter = game_ref.clone();
        let waiter = tokio::spawn(async move {
            tokio::time::timeout(Duration::from_millis(100), wait_while_paused(&game_ref_waiter)).await
        });

        tokio::time::advance(Duration::from_millis(10)).await;
        {
            let mut game = game_ref.lock().unwrap();
            game.paused = false;
            game.pause_resume.notify_one();
        }
        tokio::time::advance(Duration::from_millis(10)).await;

        assert!(
            waiter.await.unwrap().is_ok(),
            "wait_while_paused deadlocked after resume — lost-wakeup bug"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn pause_during_manual_dwell_does_not_advance() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let game = Game::new(
            "game-2".to_string(),
            "EFGH".to_string(),
            "manager-socket".to_string(),
            "test-quiz".to_string(),
            quiz.clone(),
        );
        let game_ref = Arc::new(Mutex::new({
            let mut g = game;
            g.auto_mode = false;
            g.paused = true;
            g
        }));
        let abort = Arc::new(Notify::new());
        let game_ref_dwell = game_ref.clone();

        let dwell = tokio::spawn(async move {
            dwell_auto_or_manual(&game_ref_dwell, 1, 1, abort).await;
        });

        // NOTE: `tokio::time::advance()` does a single atomic clock jump and does
        // NOT cascade through a timer that gets freshly created as a *result* of
        // a wakeup processed during that same jump (e.g. the `wait_abortable`
        // sleep armed only after `pause_notify` resolves below) — verified via a
        // standalone probe against this exact tokio version. `sleep(...).await`
        // auto-advances the paused clock step-by-step instead, correctly
        // cascading through such chained timers, so it's used here rather than
        // `advance()`. This is a test-only distinction; it does not change what
        // is asserted.
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert!(
            !dwell.is_finished(),
            "manual dwell advanced while game was paused"
        );

        {
            let mut game = game_ref.lock().unwrap();
            game.paused = false;
            game.pause_resume.notify_one();
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
        assert!(
            dwell.is_finished(),
            "manual dwell did not advance after pause cleared"
        );
    }

    /// Proves `manager:adjustTimer` (via `Game::shift_deadline`, the exact
    /// method pacing.rs's handler calls) genuinely moves WHEN the reveal fires
    /// on the server's own tick loop (`run_cooldown_with_deadline` +
    /// `Game::remaining_answer_ms`) — not just what clients are told the
    /// deadline is. A cosmetic-only fix (shifting `deadline_ms` without
    /// `deadline_instant`) would still resolve at the ORIGINAL deadline; this
    /// test fails against that regression.
    #[tokio::test(start_paused = true)]
    async fn adjust_timer_shifts_reveal_moment_not_just_the_display() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let game_ref = Arc::new(Mutex::new({
            let mut g = Game::new(
                "game-adjust".to_string(),
                "ADJT".to_string(),
                "manager-socket".to_string(),
                "test-quiz".to_string(),
                quiz,
            );
            // Mirror what open_question() arms for a live answer window,
            // without needing a full engine/lifecycle harness: a 4s deadline.
            g.deadline_instant = Some(tokio::time::Instant::now() + Duration::from_secs(4));
            g
        }));

        let abort = Arc::new(Notify::new());
        let game_ref_cooldown = game_ref.clone();
        let cooldown = tokio::spawn(async move {
            run_cooldown_with_deadline(4, abort, |_count| {}, move || {
                (game_ref_cooldown.lock().unwrap().remaining_answer_ms() / 1000) as i32
            })
            .await
        });

        // t=2s: well before the original t=4s deadline — not resolved yet.
        tokio::time::sleep(Duration::from_secs(2)).await;
        assert!(
            !cooldown.is_finished(),
            "cooldown resolved before even the original deadline"
        );

        // manager:adjustTimer +5s — the exact call pacing.rs's handler makes.
        // Extends the CURRENT deadline (t=4) by 5s -> new deadline at t=9.
        {
            let mut game = game_ref.lock().unwrap();
            game.shift_deadline(5);
        }

        // t=6s: past the ORIGINAL t=4s deadline, still short of the new t=9s
        // one. If the shift only touched `deadline_ms` cosmetically, the real
        // tokio-driven tick loop would have already resolved back at t=4 —
        // this is the assertion that catches that regression.
        tokio::time::sleep(Duration::from_secs(4)).await;
        assert!(
            !cooldown.is_finished(),
            "adjustTimer's shift was cosmetic only — reveal still fired at the pre-shift deadline"
        );

        // t=10s: past the shifted t=9s deadline — the reveal now actually fires.
        tokio::time::sleep(Duration::from_secs(4)).await;
        let outcome = cooldown.await.unwrap();
        assert_eq!(
            outcome,
            crate::socket::cooldown::CooldownOutcome::Elapsed,
            "reveal did not fire at the shifted deadline"
        );
    }

    /// BLOCKER #12: a game restored mid-question (SELECT_ANSWER on the LAST
    /// question, phase collapsed to ShowLeaderboard by the snapshot restore)
    /// must resume by RE-OPENING that exact question — not restart from
    /// question 0. We restore at index 1 of the 2-question fixture in manual
    /// mode: a correct resume opens Q1 and reveals it (parking on the manual
    /// result dwell at index 1); a buggy "reset to 0" would be parked at index 0.
    #[tokio::test(start_paused = true)]
    async fn resume_reopens_restored_question_not_index_zero() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let mut registry = GameRegistry::new(&None, quiz.clone()).await;
        let mut quizzes = std::collections::HashMap::new();
        quizzes.insert("test-quiz".to_string(), quiz);
        registry.reload_quizzes(quizzes);
        let (game_id, _invite, _host) = registry
            .create_game(
                "manager-socket".to_string(),
                Some("test-quiz".to_string()),
                "manager-client-1".to_string(),
                None, false,
                serde_json::json!({"enabled": false, "clockSync": true}),
            )
            .unwrap();

        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        {
            let mut game = game_ref.lock().unwrap();
            game.add_player(
                "player-socket".to_string(),
                "client-1".to_string(),
                "Alice".to_string(),
                None,
            )
            .unwrap();
            game.engine.start().unwrap();
            // Simulate the game reaching the LAST question (index 1) with a live
            // answer window, then a restart: game_from_snapshot collapses the
            // running phase to ShowLeaderboard but preserves current_question_index.
            game.engine.show_question(1).unwrap();
            game.engine.open_answers().unwrap();
            game.engine.phase = GamePhase::ShowLeaderboard;
            game.auto_mode = false; // manual: the result dwell parks (3600s)
        }

        let registry = Arc::new(RwLock::new(registry));
        let (_layer, io) = SocketIo::builder().build_layer();
        io.ns("/", |_socket: socketioxide::extract::SocketRef| {});

        let plan = crate::state::snapshot::ResumePlan {
            game_id: game_id.clone(),
            start_index: 1,
            finish_now: false,
        };
        let handle = tokio::spawn(resume_game_lifecycle(io, registry, plan, None));

        // Advance past ONE question's open (2s prepared) + answer window (fixture
        // time = 10s); the manual result dwell (3600s) then parks it at index 1.
        tokio::time::sleep(Duration::from_secs(45)).await;

        let (idx, phase) = {
            let g = game_ref.lock().unwrap();
            (g.engine.current_question_index, g.engine.phase)
        };
        assert_eq!(
            idx, 1,
            "resume must open the RESTORED question index (1), not reset to 0"
        );
        assert_eq!(
            phase,
            GamePhase::ShowResult,
            "the resumed last question must have revealed (reached the result dwell)"
        );
        handle.abort();
    }

    fn manual_game() -> Arc<Mutex<Game>> {
        // Game::new defaults auto_mode = false (manual) — the mode where the
        // RESULT dwell is 3600s and a lost showLeaderboard signal hangs forever.
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        Arc::new(Mutex::new(Game::new(
            "game-9".to_string(),
            "RACE".to_string(),
            "manager-socket".to_string(),
            "test-quiz".to_string(),
            quiz,
        )))
    }

    /// BLOCKER #9 (deterministic mechanism reproduction + fix): the intermittent
    /// last-question hang is a lost wakeup. `engine.reveal()` flips the phase to
    /// ShowResult, then the reveal keeps broadcasting; a manager showLeaderboard
    /// in that window calls `request_abort(ShowResult)` (phase now matches) whose
    /// `signal_abort()` notifies whatever `cooldown_abort` currently is. If the
    /// result-dwell Notify is armed only AFTER the reveal (the old order), the
    /// signal lands on the already-resolved SELECT_ANSWER Notify (no waiter) and
    /// is lost — the fresh dwell Notify never receives it and the 3600s manual
    /// dwell hangs. Arming the result-dwell Notify BEFORE the phase flip (the fix)
    /// makes the signal land on the live Notify (buffering a permit), so the dwell
    /// wakes. This test drives the exact two orderings against the REAL
    /// `request_abort` / `dwell_auto_or_manual`.
    #[tokio::test(start_paused = true)]
    async fn last_question_show_leaderboard_lost_wakeup_repro_and_fix() {
        // --- BROKEN ordering: result-dwell Notify armed AFTER phase flip + signal.
        {
            let game_ref = manual_game();
            // SELECT_ANSWER cooldown Notify, already resolved (no waiter left).
            let _stale = { game_ref.lock().unwrap().arm_abort() };
            // reveal flips the phase, but the result-dwell Notify is NOT armed yet.
            {
                game_ref.lock().unwrap().engine.phase = GamePhase::ShowResult;
            }
            // manager clicks showLeaderboard during the reveal window.
            assert!(
                request_abort(&game_ref, GamePhase::ShowResult),
                "showLeaderboard must register while phase == ShowResult"
            );
            // NOW the broken code arms the result-dwell Notify — fresh, no permit.
            let abort_result = { game_ref.lock().unwrap().arm_abort() };
            let outcome = tokio::time::timeout(
                Duration::from_secs(30),
                dwell_auto_or_manual(&game_ref, 3600, RESULT_DWELL_SECS, abort_result),
            )
            .await;
            assert!(
                outcome.is_err(),
                "the broken arm-after-reveal ordering must lose the signal and hang"
            );
        }

        // --- FIXED ordering: result-dwell Notify armed BEFORE phase flip + signal.
        {
            let game_ref = manual_game();
            let _stale = { game_ref.lock().unwrap().arm_abort() };
            // FIX: arm the result-dwell Notify BEFORE the reveal flips the phase.
            let abort_result = { game_ref.lock().unwrap().arm_abort() };
            {
                game_ref.lock().unwrap().engine.phase = GamePhase::ShowResult;
            }
            // manager clicks during the reveal window — lands on the live Notify.
            assert!(request_abort(&game_ref, GamePhase::ShowResult));
            let outcome = tokio::time::timeout(
                Duration::from_secs(30),
                dwell_auto_or_manual(&game_ref, 3600, RESULT_DWELL_SECS, abort_result),
            )
            .await;
            assert!(
                outcome.is_ok(),
                "the fixed arm-before-reveal ordering must deliver the signal, not hang"
            );
        }
    }

    /// BLOCKER #9 (end-to-end): in MANUAL mode, driving each dwell with a single
    /// abort (showLeaderboard on ShowResult, nextQuestion on ShowLeaderboard) must
    /// walk the whole game to FINISHED — including the LAST question's
    /// ShowResult -> FINISHED transition on a single showLeaderboard. Exercises the
    /// real `run_game_lifecycle` arm ordering end to end.
    #[tokio::test(start_paused = true)]
    async fn manual_mode_single_abort_per_dwell_reaches_finished() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let mut registry = GameRegistry::new(&None, quiz.clone()).await;
        let mut quizzes = std::collections::HashMap::new();
        quizzes.insert("test-quiz".to_string(), quiz);
        registry.reload_quizzes(quizzes);
        let (game_id, _invite, _host) = registry
            .create_game(
                "manager-socket".to_string(),
                Some("test-quiz".to_string()),
                "manager-client-1".to_string(),
                None, false,
                serde_json::json!({"enabled": false, "clockSync": true}),
            )
            .unwrap();

        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        {
            let mut game = game_ref.lock().unwrap();
            game.add_player(
                "player-socket".to_string(),
                "client-1".to_string(),
                "Alice".to_string(),
                None,
            )
            .unwrap();
            game.engine.start().unwrap();
            game.auto_mode = false; // manual mode — the blocker's scenario
        }

        let registry = Arc::new(RwLock::new(registry));
        let (_layer, io) = SocketIo::builder().build_layer();
        io.ns("/", |_socket: socketioxide::extract::SocketRef| {});

        // "Manager": fire exactly ONE abort per distinct dwell — showLeaderboard on
        // every ShowResult, nextQuestion on every ShowLeaderboard — until FINISHED.
        let gr = game_ref.clone();
        let driver = tokio::spawn(async move {
            let mut last_acted: Option<(GamePhase, usize)> = None;
            for _ in 0..5000 {
                let (phase, idx) = {
                    let g = gr.lock().unwrap();
                    (g.engine.phase, g.engine.current_question_index)
                };
                if phase == GamePhase::Finished {
                    break;
                }
                let key = (phase, idx);
                if last_acted != Some(key) {
                    match phase {
                        GamePhase::ShowResult => {
                            request_abort(&gr, GamePhase::ShowResult);
                            last_acted = Some(key);
                        }
                        GamePhase::ShowLeaderboard => {
                            request_abort(&gr, GamePhase::ShowLeaderboard);
                            last_acted = Some(key);
                        }
                        _ => {}
                    }
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        });

        let outcome = tokio::time::timeout(
            Duration::from_secs(120),
            run_game_lifecycle(io, registry, game_id.clone(), None),
        )
        .await;
        assert!(outcome.is_ok(), "manual-mode lifecycle hung / never returned");
        assert_eq!(
            game_ref.lock().unwrap().engine.phase,
            GamePhase::Finished,
            "manual mode must reach FINISHED with a single showLeaderboard on the last question"
        );
        driver.abort();
    }
}
