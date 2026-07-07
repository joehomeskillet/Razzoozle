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

use crate::state::{Game, GameRegistry};
use crate::question_type_wire;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::game::GameUpdateQuestion;
use razzoozle_protocol::quizz::Question;
use razzoozle_protocol::status::{
    FinishedData, GameStatus, SelectAnswerData, ShowPreparedData,
};
use socketioxide::SocketIo;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{Notify, RwLock};
use tracing::info;

use super::cooldown::run_cooldown;
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

fn build_select_answer_data(
    question: &Question,
    total_players: i32,
    server_now_ms: i64,
    deadline_ms: i64,
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
        server_seq: None,
        server_now_ms: Some(server_now_ms),
        question_start_at_server_ms: Some(server_now_ms),
        answer_deadline_at_server_ms: Some(deadline_ms),
        submitted_by: question.submitted_by.clone(),
    }
}

fn build_finished_data(game: &Game) -> FinishedData {
    FinishedData {
        subject: game.engine.quiz.subject.clone(),
        top: game.engine.players.clone(),
        rank: None,
        team_standings: None,
        recap: None,
        auto_mode: None,
    }
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
        match game.engine.show_question(index) {
            Ok(d) => d,
            Err(_) => return false,
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
    io.to(game_id.to_string())
        .emit(
            constants::game::STATUS,
            &GameStatus::ShowPrepared(ShowPreparedData {
                total_answers,
                question_number: current,
            }),
        )
        .ok();

    tokio::time::sleep(Duration::from_secs(PREPARED_DWELL_SECS)).await;

    io.to(game_id.to_string())
        .emit(constants::game::STATUS, &GameStatus::ShowQuestion(show_data))
        .ok();

    let (question, total_players, server_now_ms, deadline_ms) = {
        let mut game = game_ref.lock().unwrap();
        let server_now_ms = now_ms();
        game.engine.set_clock_ms(server_now_ms);
        let _ = game.engine.open_answers();
        let question = game.engine.current_question().clone();
        let total_players = game.players.len() as i32;
        let deadline_ms = server_now_ms + question.time as i64 * 1000;
        (question, total_players, server_now_ms, deadline_ms)
    };

    let select_data = build_select_answer_data(&question, total_players, server_now_ms, deadline_ms);
    io.to(game_id.to_string())
        .emit(constants::game::STATUS, &GameStatus::SelectAnswer(select_data))
        .ok();

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
        .emit(constants::game::START_COOLDOWN, &serde_json::json!({}))
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
        let seconds = { game_ref.lock().unwrap().engine.current_question().time };
        let abort = { game_ref.lock().unwrap().arm_abort() };
        let io_tick = io.clone();
        let gid_tick = game_id.clone();
        run_cooldown(seconds, abort, move |count| {
            io_tick
                .to(gid_tick.clone())
                .emit(constants::game::COOLDOWN, &count)
                .ok();
        })
        .await;

        // Reveal now — safe to call regardless of WHY the wait ended (timeout,
        // skip, revealAnswer, all-answered): engine.reveal() is phase-guarded,
        // so a reveal already performed by a racing path is a silent no-op.
        info!("Question cooldown resolved: gameId={}, revealing", game_id);
        perform_reveal_and_broadcast(
            game_ref.clone(),
            game_id.clone(),
            io.clone(),
            registry.clone(),
            true,
        )
        .await;

        // Result dwell — host may cut it short via manager:showLeaderboard.
        let abort = { game_ref.lock().unwrap().arm_abort() };
        wait_abortable(RESULT_DWELL_SECS, abort).await;

        let leaderboard_data = {
            let mut game = game_ref.lock().unwrap();
            game.engine.leaderboard_view().ok()
        };
        let Some(leaderboard_data) = leaderboard_data else {
            // Already advanced/finished via another path (e.g. manager:abortQuiz) — stop.
            return;
        };
        io.to(game_id.clone())
            .emit(
                constants::game::STATUS,
                &GameStatus::ShowLeaderboard(leaderboard_data),
            )
            .ok();

        // Leaderboard dwell — host may cut it short via manager:nextQuestion.
        let abort = { game_ref.lock().unwrap().arm_abort() };
        wait_abortable(LEADERBOARD_DWELL_SECS, abort).await;

        let next_phase = {
            let mut game = game_ref.lock().unwrap();
            game.engine.next_or_finish()
        };

        match next_phase {
            Ok(GamePhase::Finished) => {
                info!("Game finished: gameId={}", game_id);
                let finished = {
                    let game = game_ref.lock().unwrap();
                    build_finished_data(&game)
                };
                io.to(game_id.clone())
                    .emit(constants::game::STATUS, &GameStatus::Finished(finished))
                    .ok();
                return;
            }
            Ok(GamePhase::ShowQuestion) => {
                index = { game_ref.lock().unwrap().engine.current_question_index };
            }
            _ => return,
        }
    }
}
