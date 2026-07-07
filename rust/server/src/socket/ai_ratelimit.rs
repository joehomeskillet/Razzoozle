//! Rate limiter for text generation (per-client cooldown + lifetime cap).

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const TEXT_GEN_GC_MS: u64 = 3_600_000; // 1 hour

#[derive(Clone)]
struct TextGenState {
    last: u64, // last call timestamp (ms)
    total: u64, // cumulative call count
}

/// Get the current time in milliseconds since Unix epoch.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Module-level rate limiter store, keyed by durable client ID.
fn get_text_gen_store() -> &'static Mutex<BTreeMap<String, TextGenState>> {
    use std::sync::OnceLock;
    static STORE: OnceLock<Mutex<BTreeMap<String, TextGenState>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(BTreeMap::new()))
}

/// Sweep and remove old entries (lazy GC). Entries older than TEXT_GEN_GC_MS are deleted.
fn sweep_text_gen_store(now: u64) {
    let mut store = get_text_gen_store().lock().unwrap();
    store.retain(|_, state| now - state.last <= TEXT_GEN_GC_MS);
}

/// Check if text generation is allowed for this client. Updates and returns true if allowed.
/// Returns false if rate-limited (cooldown or lifetime exhausted).
pub fn allow_text_gen(client_id: &str, cooldown_ms: u64, max_per_socket: u64) -> bool {
    let now = now_ms();
    sweep_text_gen_store(now);

    let mut store = get_text_gen_store().lock().unwrap();

    if let Some(state) = store.get_mut(client_id) {
        if now - state.last < cooldown_ms {
            return false; // Cooldown not elapsed
        }

        if state.total >= max_per_socket {
            return false; // Lifetime cap exhausted
        }

        state.last = now;
        state.total += 1;
        true
    } else {
        store.insert(
            client_id.to_string(),
            TextGenState { last: now, total: 1 },
        );
        true
    }
}
