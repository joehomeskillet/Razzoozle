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
        shuffled_chunks: None,
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

    let (current, total, total_answers) = {
        let game = game_ref.lock().unwrap();
        (
            game.engine.current_question_index as i32 + 1,
            game.engine.quiz.questions.len() as i32,
            game.engine
                .current_question()
                .answers
                .as_ref()
                .map(|a| a.len())
                .unwrap_or(0) as i32,
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
    });
    io.to(game_id.to_string())
        .emit(constants::game::STATUS, &prepared_status)
        .ok();

    tokio::time::sleep(Duration::from_secs(PREPARED_DWELL_SECS)).await;

    let show_question_status = GameStatus::ShowQuestion(show_data);
    io.to(game_id.to_string())
        .emit(constants::game::STATUS, &show_question_status)
        .ok();

    let (question, total_players, server_now_ms, deadline_ms, server_seq) = {
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
        (question, total_players, server_now_ms, deadline_ms, server_seq)
    };

    let select_data = build_select_answer_data(
        &question,
        total_players,
        server_now_ms,
        server_now_ms,
        deadline_ms,
        server_seq,
    );
    let select_status = GameStatus::SelectAnswer(select_data);
    io.to(game_id.to_string())
        .emit(constants::game::STATUS, &select_status)
        .ok();

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
    let game_ref = {
        let reg = registry.read().await;
        match reg.get_game_by_id(&game_id) {
            Some(g) => g,
            None => return,
        }
    };

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

    let mut index = 0usize;

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

        // Reveal now — safe to call regardless of WHY the wait ended (timeout,
        // skip, revealAnswer, all-answered): engine.reveal() is phase-guarded,
        // so a reveal already performed by a racing path is a silent no-op.
        info!("Question cooldown resolved: gameId={}, revealing", game_id);
        perform_reveal_and_broadcast(game_ref.clone(), game_id.clone(), io.clone(), true).await;

        // RESULT dwell: host betrachtet die Result-Screens (SHOW_RESULT/SHOW_RESPONSES)
        // before the leaderboard. Notify armed right after reveal (Restfenster
        // reveal->arm ist mikroskopisch + selbstheilend).
        let abort_result = { game_ref.lock().unwrap().arm_abort() };
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
                        sock.emit(
                            constants::game::STATUS,
                            &GameStatus::ShowRoundRecap(ShowRoundRecapData {
                                round_recap: recap_data,
                            }),
                        )
                        .ok();
                    }
                }
            }

            // Dwell on the recap screen (manual or auto mode)
            dwell_auto_or_manual(&game_ref, 3600, RESULT_DWELL_SECS, abort_recap).await;

            // Clear temp_round_recap after showing
            {
                let mut game = game_ref.lock().unwrap();
                game.temp_round_recap = None;
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
            info!("Game finished: gameId={}", game_id);
            let (game_id_copy, subject, players_json, quiz_id) = {
                let game = game_ref.lock().unwrap();
                let players: Vec<razzoozle_protocol::results_display::GameResultPlayer> = {
                    let mut sorted = game.engine.players.clone();
                    sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
                    sorted.iter().enumerate()
                        .map(|(idx, p)| razzoozle_protocol::results_display::GameResultPlayer {
                            username: p.username.clone(),
                            points: p.points,
                            rank: (idx + 1) as i32,
                        })
                        .collect()
                };
                (
                    game.game_id.clone(),
                    game.engine.quiz.subject.clone(),
                    serde_json::to_value(&players).unwrap_or(serde_json::json!([]),),
                    None as Option<&str>, // quiz_id: TODO — extract from engine/quiz
                )
            };
            // L104: Fire-and-forget result persistence (mirror Node's behavior)
            let (recap_json, questions_json) = {
                let game = game_ref.lock().unwrap();
                build_recap_and_questions(&game.engine)
            };
            let db = db_pool.clone();
            let gid = game_id_copy.clone();
            let questions_json_clone = questions_json.clone();
            let recap_json_clone = recap_json.clone();
            tokio::spawn(async move {
                let now = chrono::Utc::now();
                let rand8: String = Uuid::new_v4().simple().to_string().chars().take(8).collect();
                let result_id = format!("{}-{}", now.timestamp_millis(), rand8);
                if let Err(e) = db::insert_result(&db, &result_id, quiz_id.as_deref(), &subject, now, &players_json, Some(&questions_json_clone), recap_json_clone.as_ref()).await {
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
                    sock.emit(constants::game::STATUS, &GameStatus::Finished(finished.clone()))
                        .ok();
                }
            }

            // Send personalized FINISHED data to each player
            let game = game_ref.lock().unwrap();
            let sorted_players: Vec<_> = {
                let mut sorted = game.engine.players.clone();
                sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
                sorted
            };
            for (rank_idx, player) in sorted_players.iter().enumerate() {
                if let Some(player_info) = game.players.iter().find(|p| p.username == player.username) {
                    let personalized_finished = FinishedData {
                        subject: finished.subject.clone(),
                        top: finished.top.clone(),
                        rank: Some((rank_idx + 1) as i32),
                        team_standings: finished.team_standings.clone(),
                        recap: finished.recap.clone(),
                        auto_mode: finished.auto_mode,
                    };
                    if let Ok(sid) = player_info.id.parse() {
                        if let Some(sock) = io.get_socket(sid) {
                            sock.emit(constants::game::STATUS, &GameStatus::Finished(personalized_finished))
                                .ok();
                        }
                    }
                }
            }
            return;
        }

        // Emit SHOW_LEADERBOARD to manager socket only
        let manager_socket_id = game_ref.lock().unwrap().manager_socket_id.clone();
        if let Ok(sid) = manager_socket_id.parse() {
            if let Some(sock) = io.get_socket(sid) {
                sock.emit(
                    constants::game::STATUS,
                    &GameStatus::ShowLeaderboard(leaderboard_data),
                )
                .ok();
            }
        }

        // Leaderboard dwell: host may cut it short via manager:nextQuestion.
        // Notify already armed before leaderboard_view() phase flip (L105-Race safe).
        dwell_auto_or_manual(&game_ref, 3600, LEADERBOARD_DWELL_SECS, abort_leaderboard).await;

        let next_phase = {
            let mut game = game_ref.lock().unwrap();
            game.engine.next_or_finish()
        };

        match next_phase {
            Ok(GamePhase::Finished) => {
                info!("Game finished: gameId={}", game_id);
                let (game_id_copy, subject, players_json, quiz_id) = {
                    let game = game_ref.lock().unwrap();
                    let players: Vec<razzoozle_protocol::results_display::GameResultPlayer> = {
                        let mut sorted = game.engine.players.clone();
                        sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
                        sorted.iter().enumerate()
                            .map(|(idx, p)| razzoozle_protocol::results_display::GameResultPlayer {
                                username: p.username.clone(),
                                points: p.points,
                                rank: (idx + 1) as i32,
                            })
                            .collect()
                    };
                    (
                        game.game_id.clone(),
                        game.engine.quiz.subject.clone(),
                        serde_json::to_value(&players).unwrap_or(serde_json::json!([]),),
                        None as Option<&str>, // quiz_id: TODO
                    )
                };
                // L104: Fire-and-forget result persistence
                let db = db_pool.clone();
                let gid = game_id_copy.clone();
                let (recap_json, questions_json) = {
                    let game = game_ref.lock().unwrap();
                    build_recap_and_questions(&game.engine)
                };
                let recap_json_for_insert = recap_json.clone();
                let questions_json_for_insert = questions_json.clone();
                tokio::spawn(async move {
                    let now = chrono::Utc::now();
                    let rand8: String = Uuid::new_v4().simple().to_string().chars().take(8).collect();
                    let result_id = format!("{}-{}", now.timestamp_millis(), rand8);
                    if let Err(e) = db::insert_result(&db, &result_id, quiz_id.as_deref(), &subject, now, &players_json, Some(&questions_json_for_insert), recap_json_for_insert.as_ref()).await {
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
                        sock.emit(constants::game::STATUS, &GameStatus::Finished(finished.clone()))
                            .ok();
                    }
                }

                // Send personalized FINISHED data to each player
                let game = game_ref.lock().unwrap();
                let sorted_players: Vec<_> = {
                    let mut sorted = game.engine.players.clone();
                    sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
                    sorted
                };
                for (rank_idx, player) in sorted_players.iter().enumerate() {
                    if let Some(player_info) = game.players.iter().find(|p| p.username == player.username) {
                        let personalized_finished = FinishedData {
                            subject: finished.subject.clone(),
                            top: finished.top.clone(),
                            rank: Some((rank_idx + 1) as i32),
                            team_standings: finished.team_standings.clone(),
                            recap: finished.recap.clone(),
                            auto_mode: finished.auto_mode,
                        };
                        if let Ok(sid) = player_info.id.parse() {
                            if let Some(sock) = io.get_socket(sid) {
                                sock.emit(constants::game::STATUS, &GameStatus::Finished(personalized_finished))
                                    .ok();
                            }
                        }
                    }
                }
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
                false,
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

    #[tokio::test(start_paused = true)]
    async fn pause_resume_wakes_dwell_without_deadlock() {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let game = Game::new(
            "game-1".to_string(),
            "ABCD".to_string(),
            "manager-socket".to_string(),
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
}
