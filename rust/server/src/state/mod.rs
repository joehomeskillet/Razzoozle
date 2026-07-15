//! state.rs — In-memory game registry and state management.

use razzoozle_protocol::quizz::Quizz;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use lazy_static::lazy_static;
use regex::Regex;

mod empty_grace;
mod eviction;
mod game;
mod rate_limit;
mod registry;
pub mod snapshot;
#[cfg(test)]
mod tests;

pub use game::Game;
pub use rate_limit::{RateLimiter, RateState};
pub use registry::GameRegistry;

// Resource caps (parity with Node)
pub const MAX_ACTIVE_GAMES: usize = 100;
pub const MAX_PLAYERS_PER_GAME: usize = 200;
pub const USERNAME_MIN_LEN: usize = 4;
pub const USERNAME_MAX_LEN: usize = 20;
pub const AVATAR_MAX_BYTES: usize = 4_000_000;
pub const AVATAR_SVG_MAX_CHARS: usize = 64 * 1024;

// Valid team identifiers for team-mode games (parity with Node's TEAMS enum,
// packages/common/src/constants.ts).
pub const TEAMS: [&str; 4] = ["red", "blue", "green", "yellow"];

// Game eviction: TTL for finished/stale games (milliseconds)
pub const GAME_EVICTION_TTL_MS: u64 = 300_000; // 5 minutes

// logged_clients cap + staleness TTL (same idiom as the RateLimiter maps
// below: bound unbounded growth from distinct client IDs, pruning only once
// the cap is exceeded). TTL is deliberately generous — far longer than any
// realistic manager session — since pruning here (unlike the rate limiter)
// would wrongly log out a still-active manager, not just reset a counter.
pub const LOGGED_CLIENTS_MAX_ENTRIES: usize = 10_000;
pub const LOGGED_CLIENT_STALE_MS: u64 = 6 * 60 * 60 * 1000; // 6 hours

// ── Path-traversal protection ─────────────────────────────────────────────────
// Validate asset IDs (quiz/result file names) to prevent path-traversal attacks
lazy_static! {
    static ref SAFE_ID_REGEX: Regex = Regex::new("^[A-Za-z0-9_-]+$").unwrap();
}

const RESERVED_IDS: &[&str] = &["__proto__", "constructor", "prototype"];

/// Validate that an asset ID (quiz id, result id, etc.) is safe for use in file paths.
/// Rejects path-traversal attempts like "../../etc/passwd" and reserved prototype-pollution keys.
pub fn safe_asset_id(id: &str) -> Result<(), String> {
    if !SAFE_ID_REGEX.is_match(id) {
        return Err("Invalid asset id: contains forbidden characters".to_string());
    }

    if RESERVED_IDS.contains(&id) {
        return Err("Invalid asset id: reserved keyword".to_string());
    }

    Ok(())
}

// ── Solo results rate limiting and caps ────────────────────────────────────────
pub const SOLO_RATE_MAX_PER_CLIENT: i32 = 120; // max 120 solo calls/min per client IP
pub const AUTH_RATE_MAX_PER_CLIENT: i32 = 10; // max 10 auth failures/min per client IP
pub const SOLO_RATE_WINDOW_MS: u64 = 60_000; // 60 seconds
pub const SOLO_RESULTS_MAX_ENTRIES: usize = 1000; // cap solo leaderboard growth

// ── Public question submission rate limiting (durable per-client + global cap) ──
pub const SUBMISSION_RATE_MAX_PER_CLIENT: i32 = 3; // max 3 submissions/60s per durable client
pub const SUBMISSION_RATE_WINDOW_MS: u64 = 60_000; // 60 seconds
pub const SUBMISSION_GLOBAL_MAX: i32 = 60; // max 60 submissions/min server-wide
pub const SUBMISSION_GLOBAL_WINDOW_MS: u64 = 60_000; // 60 seconds

// ── Student PIN validation rate limiting ──────────────────────────────────────
pub const PIN_RATE_MAX_PER_CLIENT: i32 = 3; // max 3 failed PIN attempts/60s per assignment+IP
pub const PIN_RATE_WINDOW_MS: u64 = 60_000; // 60 seconds

// ── Game-create rate limiting (per-authenticated-user) ──────────────────────────
/// SEC-03: max game-creates per authenticated user per window.
pub const GAME_CREATE_RATE_MAX_PER_USER: i32 = 10; // 10 creates/hour
pub const GAME_CREATE_RATE_WINDOW_MS: u64 = 3_600_000; // 1 hour

pub fn get_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizFixture {
    pub subject: String,
    pub questions: Vec<serde_json::Value>,
}

impl QuizFixture {
    /// Load fixture quiz (embedded at compile time so the server runs from any
    /// cwd — a runtime relative path panicked unless launched from rust/server/).
    pub fn load() -> Result<Quizz, Box<dyn std::error::Error>> {
        let contents = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/fixture-quiz.json"));
        let quiz: Quizz = serde_json::from_str(contents)?;
        Ok(quiz)
    }
}

