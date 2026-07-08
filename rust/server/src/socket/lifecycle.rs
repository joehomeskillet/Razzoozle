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
use tracing::{info, warn};

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
        question_start_at_server_ms: Some(server_now_ms),
        answer_deadline_at_server_ms: Some(deadline_ms),
        submitted_by: question.submitted_by.clone(),
    }
}

fn build_finished_data(game: &Game) -> FinishedData {
    FinishedData {
        subject: game.engine.quiz.subject.clone(),
        top: {
            let mut sorted = game.engine.players.clone();
            sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
            sorted
        },
        rank: None,
        team_standings: None,
        recap: None,
        auto_mode: Some(game.auto_mode),
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

    let (question, total_players, server_now_ms, deadline_ms, server_seq) = {
        let mut game = game_ref.lock().unwrap();
        let server_now_ms = now_ms();
        game.engine.set_clock_ms(server_now_ms);
        let _ = game.engine.open_answers();
        let question = game.engine.current_question().clone();
        let total_players = game.players.len() as i32;
        let deadline_ms = server_now_ms + question.time as i64 * 1000;
        let server_seq = if game.low_latency {
            game.server_seq += 1;
            Some(game.server_seq)
        } else {
            None
        };
        (question, total_players, server_now_ms, deadline_ms, server_seq)
    };

    let select_data = build_select_answer_data(&question, total_players, server_now_ms, deadline_ms, server_seq);
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
        // FIX L105 (abort race): arm BEFORE cooldown to ensure signals after
        // open_answers() land on the correct Notify.
        let abort = { game_ref.lock().unwrap().arm_abort() };
        let seconds = { game_ref.lock().unwrap().engine.current_question().time };
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
        perform_reveal_and_broadcast(game_ref.clone(), game_id.clone(), io.clone(), true).await;

        // RESULT dwell: host betrachtet die Result-Screens (SHOW_RESULT/SHOW_RESPONSES)
        // before the leaderboard. Notify armed right after reveal (Restfenster
        // reveal->arm ist mikroskopisch + selbstheilend).
        let abort_result = { game_ref.lock().unwrap().arm_abort() };
        if !game_ref.lock().unwrap().auto_mode {
            wait_abortable(3600, abort_result).await; // manual: Host-Signal, 1h Sicherheitsnetz
        } else {
            wait_abortable(RESULT_DWELL_SECS, abort_result).await;
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
            let db = db_pool.clone();
            let gid = game_id_copy.clone();
            tokio::spawn(async move {
                let now = chrono::Utc::now();
                if let Err(e) = db::insert_result(&db, &gid, quiz_id.as_deref(), &subject, now, &players_json, None).await {
                    warn!("Result persistence failed for gameId={}: {}", gid, e);
                }
            });

            let finished = {
                let game = game_ref.lock().unwrap();
                build_finished_data(&game)
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
        if !game_ref.lock().unwrap().auto_mode {
            // Manual mode — wait for host signal OR fall back to long safety timeout
            wait_abortable(3600, abort_leaderboard).await; // 1-hour safety net for manual mode
        } else {
            // Auto mode — use fixed LEADERBOARD_DWELL timeout
            wait_abortable(LEADERBOARD_DWELL_SECS, abort_leaderboard).await;
        }

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
                tokio::spawn(async move {
                    let now = chrono::Utc::now();
                    if let Err(e) = db::insert_result(&db, &gid, quiz_id.as_deref(), &subject, now, &players_json, None).await {
                        warn!("Result persistence failed for gameId={}: {}", gid, e);
                    }
                });

                let finished = {
                    let game = game_ref.lock().unwrap();
                    build_finished_data(&game)
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
    use crate::state::QuizFixture;

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
}
