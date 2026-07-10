use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

// ── Event types (from packages/common/src/validators/client-events.ts) ──
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum ClientEvent {
    #[serde(rename = "client-error")]
    ClientError {
        clientId: String,
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        context: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        ts: Option<i64>,
    },
    #[serde(rename = "join-failure")]
    JoinFailure {
        clientId: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        pin: Option<String>,
        reason: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        ts: Option<i64>,
    },
    #[serde(rename = "socket-reconnect")]
    SocketReconnect {
        clientId: String,
        attempts: i32,
        #[serde(skip_serializing_if = "Option::is_none")]
        ts: Option<i64>,
    },
    #[serde(rename = "answer-latency")]
    AnswerLatency {
        clientId: String,
        latencyMs: i32,
        #[serde(skip_serializing_if = "Option::is_none")]
        ts: Option<i64>,
    },
}

impl ClientEvent {
    fn event_type(&self) -> &str {
        match self {
            ClientEvent::ClientError { .. } => "client-error",
            ClientEvent::JoinFailure { .. } => "join-failure",
            ClientEvent::SocketReconnect { .. } => "socket-reconnect",
            ClientEvent::AnswerLatency { .. } => "answer-latency",
        }
    }

    fn client_id(&self) -> &str {
        match self {
            ClientEvent::ClientError { clientId, .. }
            | ClientEvent::JoinFailure { clientId, .. }
            | ClientEvent::SocketReconnect { clientId, .. }
            | ClientEvent::AnswerLatency { clientId, .. } => clientId,
        }
    }
}

// Always keep these event types (never sampled away)
// From packages/common/src/validators/client-events.ts:65-68
fn always_keep(event_type: &str) -> bool {
    matches!(event_type, "client-error" | "join-failure")
}

// ── Rate limiting: per-clientId token bucket ──────────────────────────────
// Constants from packages/socket/src/services/http/client-events.ts:22-25
const RATE_WINDOW_MS: u64 = 60_000;
const RATE_MAX: u32 = 20;
const BUCKET_MAX: usize = 10_000;
const SAMPLE_RATE: f64 = 0.1;

struct Bucket {
    count: u32,
    reset_at: u64,
}

lazy_static::lazy_static! {
    static ref BUCKETS: Arc<Mutex<HashMap<String, Bucket>>> = Arc::new(Mutex::new(HashMap::new()));
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn within_rate(client_id: &str, now: u64) -> bool {
    let mut buckets = BUCKETS.lock().unwrap();

    let bucket = if let Some(b) = buckets.get_mut(client_id) {
        if now >= b.reset_at {
            // Reset the bucket
            *b = Bucket {
                count: 0,
                reset_at: now + RATE_WINDOW_MS,
            };
        }
        b
    } else {
        // Add new bucket if under cap, otherwise evict oldest
        if buckets.len() >= BUCKET_MAX {
            // Evict first entry (oldest insertion)
            if let Some(key) = buckets.keys().next().cloned() {
                buckets.remove(&key);
            }
        }
        buckets.insert(
            client_id.to_string(),
            Bucket {
                count: 0,
                reset_at: now + RATE_WINDOW_MS,
            },
        );
        buckets.get_mut(client_id).unwrap()
    };

    if bucket.count >= RATE_MAX {
        return false;
    }

    bucket.count += 1;
    true
}

// Deterministic hash for sampling (from packages/socket/src/services/http/client-events.ts:63-71)
fn sample_hash(key: &str) -> f64 {
    let mut h = 2166136261u32;
    for c in key.bytes() {
        h ^= c as u32;
        h = h.wrapping_mul(16777619);
    }
    (h as f64) / 4294967296.0
}

pub async fn handle_client_events(
    event: Result<Json<ClientEvent>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let now = now_ms();

    let event = match event {
        Ok(Json(e)) => e,
        Err(rej) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": rej.to_string() })),
            )
                .into_response();
        }
    };

    // Rate limit check (per-clientId)
    if !within_rate(event.client_id(), now) {
        return StatusCode::NO_CONTENT.into_response();
    }

    // Sampling: always keep errors/join-failures, sample the rest at 0.1
    let should_keep = always_keep(event.event_type())
        || sample_hash(&format!("{}:{}", event.client_id(), event.event_type())) < SAMPLE_RATE;

    if !should_keep {
        return StatusCode::NO_CONTENT.into_response();
    }

    // Log the event (in production, this goes to the client event ring via logger)
    tracing::info!(event = ?event, "client-event");

    StatusCode::NO_CONTENT.into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sample_hash_deterministic() {
        let hash1 = sample_hash("client-a:answer-latency");
        let hash2 = sample_hash("client-a:answer-latency");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_within_rate() {
        // Clear state
        BUCKETS.lock().unwrap().clear();

        let now = now_ms();
        assert!(within_rate("client-1", now));
        assert!(within_rate("client-1", now));

        // Exhaust rate limit
        for _ in 0..18 {
            assert!(within_rate("client-1", now));
        }
        // 20th should succeed
        assert!(within_rate("client-1", now));
        // 21st should fail
        assert!(!within_rate("client-1", now));
    }

    #[test]
    fn test_always_keep_types() {
        assert!(always_keep("client-error"));
        assert!(always_keep("join-failure"));
        assert!(!always_keep("answer-latency"));
        assert!(!always_keep("socket-reconnect"));
    }
}
