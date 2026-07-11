use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use super::logs::{push_client_log, redact_value};
use super::metrics::CLIENT_EVENTS_TOTAL;

// ── Input caps (from packages/common/src/validators/client-events.ts:14-15) ──
const CAP_SHORT: usize = 200; // clientId, name, url, pin, reason
const CAP_TEXT: usize = 2000; // message, context

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

    /// Validate input caps (Node Zod validators parity).
    /// Returns first Zod-like error message on violation.
    fn validate(&self) -> Result<(), &'static str> {
        match self {
            ClientEvent::ClientError {
                clientId,
                message,
                context,
                ..
            } => {
                if clientId.is_empty() || clientId.len() > CAP_SHORT {
                    return Err("String must contain at most 200 character(s)");
                }
                if message.len() > CAP_TEXT {
                    return Err("String must contain at most 2000 character(s)");
                }
                if let Some(ctx) = context {
                    if ctx.len() > CAP_TEXT {
                        return Err("String must contain at most 2000 character(s)");
                    }
                }
                Ok(())
            }
            ClientEvent::JoinFailure {
                clientId,
                pin,
                reason,
                ..
            } => {
                if clientId.is_empty() || clientId.len() > CAP_SHORT {
                    return Err("String must contain at most 200 character(s)");
                }
                if let Some(p) = pin {
                    if p.len() > CAP_SHORT {
                        return Err("String must contain at most 200 character(s)");
                    }
                }
                if reason.len() > CAP_SHORT {
                    return Err("String must contain at most 200 character(s)");
                }
                Ok(())
            }
            ClientEvent::SocketReconnect { clientId, attempts, .. } => {
                if clientId.is_empty() || clientId.len() > CAP_SHORT {
                    return Err("String must contain at most 200 character(s)");
                }
                if *attempts < 0 || *attempts > 100000 {
                    return Err("Number must be greater than or equal to 0");
                }
                Ok(())
            }
            ClientEvent::AnswerLatency {
                clientId,
                latencyMs,
                ..
            } => {
                if clientId.is_empty() || clientId.len() > CAP_SHORT {
                    return Err("String must contain at most 200 character(s)");
                }
                if *latencyMs < 0 || *latencyMs > 600000 {
                    return Err("Number must be greater than or equal to 0");
                }
                Ok(())
            }
        }
    }
}

// Always keep these event types (never sampled away)
// From packages/common/src/validators/client-events.ts:65-68
fn always_keep(event_type: &str) -> bool {
    matches!(event_type, "client-error" | "join-failure")
}

// ── Rate limiting: per-clientId token bucket with LRU eviction ──────────────
// Constants from packages/socket/src/services/http/client-events.ts:22-25
const RATE_WINDOW_MS: u64 = 60_000;
const RATE_MAX: u32 = 20;
const BUCKET_MAX: usize = 10_000;
const SAMPLE_RATE: f64 = 0.1;

struct Bucket {
    count: u32,
    reset_at: u64,
}

/// Insertion-order queue for LRU eviction (Node parity: client-events.ts:40-50).
/// When BUCKET_MAX is reached, evict the oldest (first-inserted) key.
struct RateLimiterState {
    buckets: HashMap<String, Bucket>,
    insertion_order: VecDeque<String>,
}

lazy_static::lazy_static! {
    static ref RATE_LIMITER_STATE: Arc<Mutex<RateLimiterState>> = Arc::new(Mutex::new(RateLimiterState {
        buckets: HashMap::new(),
        insertion_order: VecDeque::new(),
    }));
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn within_rate(client_id: &str, now: u64) -> bool {
    let mut state = RATE_LIMITER_STATE.lock().unwrap();

    let bucket = if let Some(b) = state.buckets.get_mut(client_id) {
        if now >= b.reset_at {
            // Reset the bucket
            *b = Bucket {
                count: 0,
                reset_at: now + RATE_WINDOW_MS,
            };
        }
        b
    } else {
        // Add new bucket if under cap, otherwise evict oldest (LRU)
        if state.buckets.len() >= BUCKET_MAX {
            // Evict oldest entry (first in insertion order)
            if let Some(oldest_key) = state.insertion_order.pop_front() {
                state.buckets.remove(&oldest_key);
            }
        }
        state.buckets.insert(
            client_id.to_string(),
            Bucket {
                count: 0,
                reset_at: now + RATE_WINDOW_MS,
            },
        );
        state.insertion_order.push_back(client_id.to_string());
        state.buckets.get_mut(client_id).unwrap()
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

    // Input validation: enforce caps (Node Zod parity)
    if let Err(cap_error) = event.validate() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": cap_error })),
        )
            .into_response();
    }

    // Rate limit check (per-clientId)
    if !within_rate(event.client_id(), now) {
        return StatusCode::NO_CONTENT.into_response();
    }

    // Increment counter for all accepted, rate-limited events (Node parity: client-events.ts:126)
    CLIENT_EVENTS_TOTAL.with_label_values(&[event.event_type()]).inc();

    // Sampling: always keep errors/join-failures, sample the rest at 0.1
    let should_keep = always_keep(event.event_type())
        || sample_hash(&format!("{}:{}", event.client_id(), event.event_type())) < SAMPLE_RATE;

    if should_keep {
        // Create a redacted log line for the CLIENT ring (parity: Node client-events.ts:133-134)
        let mut log_obj = serde_json::Map::new();
        log_obj.insert("level".to_string(), json!("info"));
        log_obj.insert("time".to_string(), json!(chrono::Utc::now().timestamp_millis()));
        log_obj.insert("service".to_string(), json!("quiz-socket"));
        log_obj.insert("target".to_string(), json!(module_path!()));
        log_obj.insert("msg".to_string(), json!("client-event"));

        // Serialize the event to JSON for the ring
        let event_value = serde_json::to_value(&event).unwrap_or(Value::Null);
        log_obj.insert("clientEvent".to_string(), event_value);

        // Redact the entire log object (applies redact_value recursively)
        let mut log_value = Value::Object(log_obj);
        redact_value(&mut log_value);

        // Push to CLIENT ring
        push_client_log(&log_value.to_string());
    }

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
        let mut state = RATE_LIMITER_STATE.lock().unwrap();
        state.buckets.clear();
        state.insertion_order.clear();
        drop(state);

        let now = now_ms();
        assert!(within_rate("client-1", now));
        assert!(within_rate("client-1", now));

        // Exhaust rate limit (RATE_MAX = 20 total: 2 above + 17 here + 1 below)
        for _ in 0..17 {
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

    #[test]
    fn test_input_caps_clientId_too_long() {
        let event = ClientEvent::ClientError {
            clientId: "x".repeat(201),
            message: "error".to_string(),
            context: None,
            ts: None,
        };
        assert!(event.validate().is_err());
    }

    #[test]
    fn test_input_caps_message_too_long() {
        let event = ClientEvent::ClientError {
            clientId: "client-1".to_string(),
            message: "x".repeat(2001),
            context: None,
            ts: None,
        };
        assert!(event.validate().is_err());
    }

    #[test]
    fn test_input_caps_context_too_long() {
        let event = ClientEvent::ClientError {
            clientId: "client-1".to_string(),
            message: "error".to_string(),
            context: Some("x".repeat(2001)),
            ts: None,
        };
        assert!(event.validate().is_err());
    }

    #[test]
    fn test_input_caps_latency_too_high() {
        let event = ClientEvent::AnswerLatency {
            clientId: "client-1".to_string(),
            latencyMs: 600001,
            ts: None,
        };
        assert!(event.validate().is_err());
    }

    #[test]
    fn test_input_caps_attempts_range() {
        let event = ClientEvent::SocketReconnect {
            clientId: "client-1".to_string(),
            attempts: 100001,
            ts: None,
        };
        assert!(event.validate().is_err());
    }

    #[test]
    fn test_lru_eviction_order() {
        // Clear state
        let mut state = RATE_LIMITER_STATE.lock().unwrap();
        state.buckets.clear();
        state.insertion_order.clear();
        drop(state);

        let now = now_ms();

        // Add 3 clients
        within_rate("client-a", now);
        within_rate("client-b", now);
        within_rate("client-c", now);

        let state = RATE_LIMITER_STATE.lock().unwrap();
        assert_eq!(state.insertion_order.len(), 3);
        assert_eq!(state.insertion_order[0], "client-a");
        assert_eq!(state.insertion_order[1], "client-b");
        assert_eq!(state.insertion_order[2], "client-c");
    }

    #[test]
    fn test_client_event_ring_push() {
        // Clear CLIENT_RING
        // Note: We can't easily test this in unit tests due to the static CLIENT_RING,
        // but the integration test in the gate will verify the ring population.
        let event = ClientEvent::AnswerLatency {
            clientId: "test-client".to_string(),
            latencyMs: 100,
            ts: Some(1234567890),
        };

        // Verify event serializes correctly
        let serialized = serde_json::to_string(&event).expect("should serialize");
        assert!(serialized.contains("test-client"));
        assert!(serialized.contains("\"type\":\"answer-latency\""));
    }
}
