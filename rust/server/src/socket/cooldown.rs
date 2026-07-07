//! cooldown.rs — generic abortable ~1s-tick countdown timer. This is the
//! server clock behind BOTH the pre-question 3-2-1 intro (`game:startCooldown`)
//! and the per-question SELECT_ANSWER answer window (`game:cooldown`).
//!
//! Mirrors node's `cooldown-timer.ts` exactly: `count` starts at `seconds - 1`
//! and is emitted BEFORE the tick that resolves — nothing is ever emitted for
//! 0, and the timer naturally resolves ~`seconds` after it started. This is
//! parity with the shipped node behaviour, not a redesign.
//!
//! IO-agnostic on purpose: the caller supplies an `on_tick` callback, so this
//! stays unit-testable without a live socket.io server (see tests below).

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;

/// How a countdown ended: naturally (reached 0) or was cut short.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CooldownOutcome {
    /// Reached 0 naturally — the answer window (or intro) elapsed.
    Elapsed,
    /// `abort` was notified before reaching 0 — skip / reveal-now / all-answered
    /// / a manager live-control interrupted the wait.
    Aborted,
}

/// Run the countdown, calling `on_tick(remaining)` once per second while it is
/// live. Resolves IMMEDIATELY once `abort.notified()` fires (no waiting for the
/// next 1s tick) — this is the "abortable tokio task" R3 asks for.
pub async fn run_cooldown<F: FnMut(i32)>(
    seconds: i32,
    abort: Arc<Notify>,
    mut on_tick: F,
) -> CooldownOutcome {
    let mut count = seconds - 1;

    loop {
        if count <= 0 {
            return CooldownOutcome::Elapsed;
        }

        tokio::select! {
            _ = abort.notified() => {
                return CooldownOutcome::Aborted;
            }
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                on_tick(count);
                count -= 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[tokio::test(start_paused = true)]
    async fn natural_elapse_emits_descending_ticks_then_resolves() {
        let abort = Arc::new(Notify::new());
        let ticks: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let ticks_clone = ticks.clone();

        let outcome = run_cooldown(3, abort, move |count| {
            ticks_clone.lock().unwrap().push(count);
        })
        .await;

        // seconds=3 -> count starts at 2, ticks 2 then 1, resolves at the tick
        // that would have emitted 0 (matches node: 0 is never emitted).
        assert_eq!(outcome, CooldownOutcome::Elapsed);
        assert_eq!(*ticks.lock().unwrap(), vec![2, 1]);
    }

    #[tokio::test(start_paused = true)]
    async fn abort_before_any_tick_resolves_immediately_with_no_ticks() {
        let abort = Arc::new(Notify::new());
        let ticks: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let ticks_clone = ticks.clone();
        abort.notify_one();

        let outcome = run_cooldown(10, abort, move |count| {
            ticks_clone.lock().unwrap().push(count);
        })
        .await;

        assert_eq!(outcome, CooldownOutcome::Aborted);
        assert!(ticks.lock().unwrap().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn abort_mid_countdown_stops_further_ticks() {
        let abort = Arc::new(Notify::new());
        let ticks: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let ticks_clone = ticks.clone();
        let abort_clone = abort.clone();

        let cooldown = tokio::spawn(async move {
            run_cooldown(10, abort_clone, move |count| {
                ticks_clone.lock().unwrap().push(count);
            })
            .await
        });

        // This sleep and the cooldown task's internal 1s ticks are both
        // virtual — under a paused clock with nothing else runnable, tokio
        // auto-advances to each deadline in order, so this deterministically
        // wakes AFTER 2 ticks (9, 8, at t=1s/2s) and BEFORE the 3rd (t=3s).
        tokio::time::sleep(Duration::from_millis(2500)).await;
        abort.notify_one();

        let outcome = cooldown.await.unwrap();
        assert_eq!(outcome, CooldownOutcome::Aborted);
        assert_eq!(*ticks.lock().unwrap(), vec![9, 8]);
    }
}
