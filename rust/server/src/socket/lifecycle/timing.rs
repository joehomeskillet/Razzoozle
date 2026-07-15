use super::*;

pub(crate) fn now_ms() -> i64 {
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
pub(crate) async fn wait_while_paused(game_ref: &Arc<Mutex<Game>>) {
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
pub(crate) async fn dwell_auto_or_manual(
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