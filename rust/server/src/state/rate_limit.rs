use std::collections::HashMap;
use std::sync::Mutex;

use super::{
    get_now_ms, AUTH_RATE_MAX_PER_CLIENT, SOLO_RATE_MAX_PER_CLIENT, SOLO_RATE_WINDOW_MS,
    SUBMISSION_GLOBAL_MAX, SUBMISSION_GLOBAL_WINDOW_MS, SUBMISSION_RATE_MAX_PER_CLIENT,
    SUBMISSION_RATE_WINDOW_MS, PIN_RATE_MAX_PER_CLIENT, PIN_RATE_WINDOW_MS,
};

#[derive(Debug, Clone)]
pub struct RateState {
    pub count: i32,
    pub window_start_ms: u64,
}

impl RateState {
    pub fn new() -> Self {
        Self {
            count: 0,
            window_start_ms: get_now_ms(),
        }
    }

    /// Reset the window if it has expired
    pub fn maybe_reset(&mut self, now_ms: u64) {
        if now_ms.saturating_sub(self.window_start_ms) > SOLO_RATE_WINDOW_MS {
            self.count = 0;
            self.window_start_ms = now_ms;
        }
    }
}

/// Rate limiter for solo API, auth attempts, and public question submissions
/// per-IP (or per-client-ID for socket handlers)
pub struct RateLimiter {
    solo_by_key: Mutex<HashMap<String, RateState>>,
    auth_by_key: Mutex<HashMap<String, RateState>>,
    submission_by_key: Mutex<HashMap<String, RateState>>,
    submission_global: Mutex<RateState>,
    pin_by_key: Mutex<HashMap<String, RateState>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            solo_by_key: Mutex::new(HashMap::new()),
            auth_by_key: Mutex::new(HashMap::new()),
            submission_by_key: Mutex::new(HashMap::new()),
            submission_global: Mutex::new(RateState::new()),
            pin_by_key: Mutex::new(HashMap::new()),
        }
    }

    /// Check if a solo call is allowed for the given key (IP address or client ID).
    /// Returns true if allowed, false if rate-limited.
    pub fn check_solo_rate(&self, key: &str) -> bool {
        let now = get_now_ms();
        if let Ok(mut map) = self.solo_by_key.lock() {
            let entry = map.entry(key.to_string()).or_insert_with(RateState::new);
            entry.maybe_reset(now);

            let is_limited = entry.count >= SOLO_RATE_MAX_PER_CLIENT;
            if !is_limited {
                entry.count += 1;
            }

            // Evict stale keys to prevent unbounded growth
            if map.len() > 10000 {
                let now = get_now_ms();
                map.retain(|_, state| now.saturating_sub(state.window_start_ms) <= SOLO_RATE_WINDOW_MS);
            }

            !is_limited
        } else {
            true // lock failed, allow in fail-open mode
        }
    }


    /// Record a failed auth attempt and return true if throttled (for the given key).
    /// Returns true if throttled, false if allowed.
    pub fn record_auth_failure_and_check_throttle(&self, key: &str) -> bool {
        let now = get_now_ms();
        if let Ok(mut map) = self.auth_by_key.lock() {
            let entry = map.entry(key.to_string()).or_insert_with(RateState::new);
            entry.maybe_reset(now);
            entry.count += 1;

            let is_throttled = entry.count > AUTH_RATE_MAX_PER_CLIENT;

            // Evict stale keys to prevent unbounded growth
            if map.len() > 10000 {
                let now = get_now_ms();
                map.retain(|_, state| now.saturating_sub(state.window_start_ms) <= SOLO_RATE_WINDOW_MS);
            }

            is_throttled
        } else {
            false // lock failed, allow in fail-open mode
        }
    }

    /// Deprecated: for backwards compatibility, delegate to per-key version with empty key
    pub fn check_global_solo_rate(&self) -> bool {
        self.check_solo_rate("global")
    }

    /// Deprecated: for backwards compatibility, delegate to per-key version with empty key
    pub fn record_auth_failure_and_check_throttle_global(&self) -> bool {
        self.record_auth_failure_and_check_throttle("global")
    }

    // ── APPENDED for rust-auth-parity (manager:auth throttle fix) ────────────
    // Node's submissionRateLimit.ts keeps isAuthThrottled() (pure read) and
    // recordAuthFailure() (increments ONLY on an actual failed compare) as two
    // separate primitives against a single global window, so a throttled
    // window rejects even a would-be-correct password without ever counting
    // that rejection as a new failure. The existing
    // record_auth_failure_and_check_throttle() above conflates "record" and
    // "check" into one call, which can't reproduce that pre-compare peek
    // without also incrementing on success. These two thin wrappers restore
    // that split, reusing the same "global" key + window/threshold as the
    // existing method above (append-only — no existing method touched).

    /// Peek whether the global auth-failure window has already crossed the
    /// throttle threshold, WITHOUT recording a new failure. Mirrors Node's
    /// isAuthThrottled().
    pub fn is_auth_throttled_global(&self) -> bool {
        let now = get_now_ms();
        if let Ok(map) = self.auth_by_key.lock() {
            if let Some(entry) = map.get("global") {
                return now.saturating_sub(entry.window_start_ms) <= SOLO_RATE_WINDOW_MS
                    && entry.count >= AUTH_RATE_MAX_PER_CLIENT;
            }
        }
        false
    }

    /// Record a failed manager:auth attempt against the global window WITHOUT
    /// checking throttle. Mirrors Node's recordAuthFailure() — call ONLY after
    /// an actual failed password compare, never on success.
    pub fn record_auth_failure_global(&self) {
        let now = get_now_ms();
        if let Ok(mut map) = self.auth_by_key.lock() {
            let entry = map.entry("global".to_string()).or_insert_with(RateState::new);
            entry.maybe_reset(now);
            entry.count += 1;
        }
    }

    /// Check if a submission is allowed for the given durable client ID (per-client throttle).
    /// Returns true if allowed, false if rate-limited.
    /// Mirrors Node's checkRateLimit(): MAX_COUNT=3 per WINDOW_MS=60s per durable client.
    pub fn check_submission_rate(&self, key: &str) -> bool {
        let now = get_now_ms();
        if let Ok(mut map) = self.submission_by_key.lock() {
            let entry = map.entry(key.to_string()).or_insert_with(RateState::new);

            // Reset if window expired
            if now.saturating_sub(entry.window_start_ms) > SUBMISSION_RATE_WINDOW_MS {
                entry.count = 0;
                entry.window_start_ms = now;
            }

            let is_limited = entry.count >= SUBMISSION_RATE_MAX_PER_CLIENT;
            if !is_limited {
                entry.count += 1;
            }

            // Evict stale keys to prevent unbounded growth
            if map.len() > 10000 {
                let now = get_now_ms();
                map.retain(|_, state| now.saturating_sub(state.window_start_ms) <= SUBMISSION_RATE_WINDOW_MS);
            }

            !is_limited
        } else {
            true // lock failed, allow in fail-open mode
        }
    }

    /// Check if a submission is allowed against the global server-wide ceiling.
    /// Returns true if allowed, false if rate-limited.
    /// Mirrors Node's checkGlobalSubmissionRate(): MAX_COUNT=60 per GLOBAL_WINDOW_MS=60s.
    pub fn check_global_submission_rate(&self) -> bool {
        let now = get_now_ms();
        if let Ok(mut global) = self.submission_global.lock() {
            if now.saturating_sub(global.window_start_ms) > SUBMISSION_GLOBAL_WINDOW_MS {
                global.window_start_ms = now;
                global.count = 1;
                return true;
            }

            if global.count >= SUBMISSION_GLOBAL_MAX {
                return false;
            }

            global.count += 1;
            true
        } else {
            true // lock failed, allow in fail-open mode
        }
    }

    /// Check if a PIN validation is allowed for the given key (assignment:IP).
    /// Increments counter ONLY on failed validations.
    /// Returns false if rate-limited (too many failures), true if allowed.
    pub fn check_pin_rate(&self, key: &str, failed: bool) -> bool {
        let now = get_now_ms();
        if let Ok(mut map) = self.pin_by_key.lock() {
            let entry = map.entry(key.to_string()).or_insert_with(RateState::new);

            // Reset if window expired
            if now.saturating_sub(entry.window_start_ms) > PIN_RATE_WINDOW_MS {
                entry.count = 0;
                entry.window_start_ms = now;
            }

            // Increment counter ONLY on failed validation
            if failed {
                entry.count += 1;
            }

            let is_limited = entry.count > PIN_RATE_MAX_PER_CLIENT;

            // Evict stale keys to prevent unbounded growth
            if map.len() > 10000 {
                let now = get_now_ms();
                map.retain(|_, state| now.saturating_sub(state.window_start_ms) <= PIN_RATE_WINDOW_MS);
            }

            !is_limited
        } else {
            true // lock failed, allow in fail-open mode
        }
    }
}
