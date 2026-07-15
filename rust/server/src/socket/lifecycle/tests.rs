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
