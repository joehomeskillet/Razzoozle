//! Shared GPU image-gen throttle + secret scan for the public /submit AI ops.
//! Mirrors packages/socket/src/handlers/imageGenThrottle.ts +
//! services/submissionRateLimit.ts#checkImageGenHourlyLimit.
//!
//! Keyed by the DURABLE clientId (not socket.id) so a reconnect does NOT reset
//! the limits. Stores are module-level (process-wide, exactly like Node's module
//! Maps) rather than per-connection — a per-socket store would let a client dodge
//! the cap by reconnecting.

use std::collections::HashMap;
use std::sync::Mutex;

use lazy_static::lazy_static;
use regex::Regex;

use crate::state::get_now_ms;

const IMAGE_GEN_COOLDOWN_MS: u64 = 30_000;
const IMAGE_GEN_MAX_PER_SOCKET: u32 = 5;
const IMAGE_GEN_GC_MS: u64 = 3_600_000;
const IMAGE_GEN_HOUR_MS: u64 = 3_600_000;
const IMAGE_GEN_MAX_PER_HOUR: u32 = 10;

struct ImageGenState {
    last: u64,
    total: u32,
}

struct HourState {
    count: u32,
    window_start: u64,
}

lazy_static! {
    /// /sk-/i, /AKIA/, /BEGIN PRIVATE KEY/i — best-effort leaked-secret guard
    /// (byte-identical to Node's SECRET_PATTERNS).
    static ref SECRET_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)sk-").unwrap(),
        Regex::new(r"AKIA").unwrap(),
        Regex::new(r"(?i)BEGIN PRIVATE KEY").unwrap(),
    ];
    /// clientId -> cooldown/lifetime state.
    static ref IMAGE_GEN_STORE: Mutex<HashMap<String, ImageGenState>> = Mutex::new(HashMap::new());
    /// clientId -> rolling hourly window (separate store, like Node).
    static ref IMAGE_GEN_HOUR_STORE: Mutex<HashMap<String, HourState>> = Mutex::new(HashMap::new());
}

/// True if `text` matches any leaked-secret pattern.
pub(crate) fn matches_secret(text: &str) -> bool {
    SECRET_PATTERNS.iter().any(|re| re.is_match(text))
}

/// Durable hourly cap (10/h). Mirrors checkImageGenHourlyLimit. Consumed ONLY on
/// the dispatch path — call it AFTER cooldown+lifetime pass so a cooldown-reject
/// never burns an hourly credit. Locked while the caller holds IMAGE_GEN_STORE
/// (consistent STORE→HOUR lock order — the only place both are held).
fn check_image_gen_hourly(now: u64, key: &str) -> bool {
    let mut hour = match IMAGE_GEN_HOUR_STORE.lock() {
        Ok(g) => g,
        Err(_) => return true, // fail-open (a lock bug must never lock out a user)
    };

    if let Some(st) = hour.get_mut(key) {
        if now.saturating_sub(st.window_start) <= IMAGE_GEN_HOUR_MS {
            if st.count >= IMAGE_GEN_MAX_PER_HOUR {
                return false;
            }
            st.count += 1;
            return true;
        }
    }

    // New or expired window: sweep stale entries, then open a fresh window.
    hour.retain(|_, st| now.saturating_sub(st.window_start) <= IMAGE_GEN_HOUR_MS);
    hour.insert(
        key.to_string(),
        HourState {
            count: 1,
            window_start: now,
        },
    );
    true
}

/// Cooldown (30s) + per-client lifetime (5) FIRST — these reject WITHOUT touching
/// the hourly counter — THEN durable hourly (10/h). Byte-identical order to Node's
/// `tryConsumeImageGenCredit`. `Ok(())` = a credit was consumed; `Err` = the i18n
/// error key to emit via IMAGE_ERROR. SHARED by GENERATE_IMAGE + EDIT_IMAGE, so a
/// client can't get 5+5 / 10+10 by alternating event names.
pub(crate) fn try_consume_image_gen_credit(client_id: &str) -> Result<(), &'static str> {
    let now = get_now_ms();
    let mut store = match IMAGE_GEN_STORE.lock() {
        Ok(g) => g,
        Err(_) => return Ok(()), // fail-open
    };

    // Lazy GC so the map can't grow unbounded across many distinct clients.
    store.retain(|_, st| now.saturating_sub(st.last) <= IMAGE_GEN_GC_MS);

    // Cooldown + lifetime FIRST (reject WITHOUT consuming an hourly credit).
    if let Some(st) = store.get(client_id) {
        if now.saturating_sub(st.last) < IMAGE_GEN_COOLDOWN_MS {
            return Err("errors:submission.imageRateLimited");
        }
        if st.total >= IMAGE_GEN_MAX_PER_SOCKET {
            return Err("errors:submission.imageLimitReached");
        }
    }

    // Durable hourly cap — consumed only on the dispatch path.
    if !check_image_gen_hourly(now, client_id) {
        return Err("errors:submission.imageLimitReached");
    }

    match store.get_mut(client_id) {
        Some(st) => {
            st.last = now;
            st.total += 1;
        }
        None => {
            store.insert(client_id.to_string(), ImageGenState { last: now, total: 1 });
        }
    }

    Ok(())
}
