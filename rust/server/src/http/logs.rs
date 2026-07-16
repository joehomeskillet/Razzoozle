// http/logs.rs — DEV-gated NDJSON log downloads.
//
// Parity source (Node): packages/socket/src/services/log-buffer.ts (bounded
// rings of already-redacted, already-serialized log LINES) plus the
// /api/v1/observability/logs/{server,client} routes in services/http-routes.ts
// (dev-gated, requireKey, text/plain attachment).
//
// The SERVER ring is fed by `RingLayer`, a tracing layer registered additively
// in main.rs next to the fmt layer: every emitted tracing event is serialized
// to one JSON line, redacted (same key DENY-list as the Node pino redact
// config in services/logger.ts), then pushed here.
//
// The CLIENT ring now populated by the POST /api/v1/client-events handler
// (http/client_events.rs), which pushes accepted/sampled events as redacted
// JSON lines for the DEV-gated download endpoint (Node parity: log-buffer.ts
// pushClientLog).

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use axum::extract::Query;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use lazy_static::lazy_static;
use serde_json::{json, Value};
use tracing::field::{Field, Visit};
use tracing_subscriber::layer::Context;

use super::{dev_api_key, is_dev_mode, json_error_response};

// Ring capacity (orchestrator ruling: 1000, FIFO drop-oldest).
const MAX_LINES: usize = 1000;

lazy_static! {
    static ref SERVER_RING: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
    static ref CLIENT_RING: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
}

// ── Ring primitives (parity: log-buffer.ts push/serverLogLines) ─────────────

/// Append one finished log line to a bounded ring (drop oldest). A serialized
/// line may carry a trailing newline; strip a single one so the NDJSON join in
/// the download endpoint does not produce blank lines. Empty/whitespace lines
/// are ignored (never stored) — same as Node's push().
fn push(ring: &Mutex<VecDeque<String>>, line: &str) {
    if line.trim().is_empty() {
        return;
    }

    let normalized = line.strip_suffix('\n').unwrap_or(line);

    // A poisoned lock only means another thread panicked mid-push; the ring
    // holds plain Strings, so recover the data instead of losing all logs.
    let mut ring = ring.lock().unwrap_or_else(|p| p.into_inner());
    ring.push_back(normalized.to_string());

    if ring.len() > MAX_LINES {
        ring.pop_front();
    }
}

/// Return COPIES so callers can join without holding the lock (Node parity).
fn lines(ring: &Mutex<VecDeque<String>>) -> Vec<String> {
    ring.lock()
        .unwrap_or_else(|p| p.into_inner())
        .iter()
        .cloned()
        .collect()
}

/// Push a redacted client-event log line to the CLIENT ring.
/// Used by POST /api/v1/client-events handler to surface accepted events in DEV downloads.
pub fn push_client_log(line: &str) {
    push(&CLIENT_RING, line);
}

// ── Redaction (parity: REDACT_PATHS in services/logger.ts) ──────────────────

/// Key DENY-list, verbatim from the Node pino redact config. Node lists each
/// key at top level AND one nesting level (`*.key`); we redact matching keys
/// at EVERY object depth, which is a strict superset (never leaks more).
const REDACT_KEYS: &[&str] = &[
    "password",
    "managerPassword",
    "apiKey",
    "devApiKey",
    "key",
    "token",
    "authorization",
    "cookie",
    "dataUrl",
    "baseUrl",
    "solutions",
    "correct",
    "acceptedAnswers",
    "answerText",
];

const REDACTED: &str = "[REDACTED]";

pub(super) fn redact_value(value: &mut Value) {
    if let Value::Object(map) = value {
        for (k, v) in map.iter_mut() {
            if REDACT_KEYS.contains(&k.as_str()) {
                *v = Value::String(REDACTED.to_string());
            } else {
                redact_value(v);
            }
        }
    } else if let Value::Array(items) = value {
        for item in items.iter_mut() {
            redact_value(item);
        }
    }
}

// ── tracing layer feeding the SERVER ring ───────────────────────────────────

/// Collects the flat key/value fields of one tracing event into a JSON map.
/// tracing event fields are scalars, so redaction by field name here matches
/// the Node top-level pino paths; nested-object redaction in redact_value()
/// only ever applies if a future caller logs a serde_json object graph.
#[derive(Default)]
struct JsonVisitor {
    fields: serde_json::Map<String, Value>,
}

impl Visit for JsonVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        self.fields
            .insert(field.name().to_string(), Value::String(value.to_string()));
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields.insert(field.name().to_string(), json!(value));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields.insert(field.name().to_string(), json!(value));
    }

    fn record_f64(&mut self, field: &Field, value: f64) {
        self.fields.insert(field.name().to_string(), json!(value));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields.insert(field.name().to_string(), json!(value));
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.fields.insert(
            field.name().to_string(),
            Value::String(format!("{:?}", value)),
        );
    }
}

/// tracing layer that mirrors every event into the bounded SERVER ring as one
/// redacted JSON line (the Rust counterpart of the Node teeDest in logger.ts:
/// stdout output is untouched — the fmt layer still owns it — this layer only
/// captures a redacted copy for the DEV download endpoint).
pub struct RingLayer;

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for RingLayer {
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let mut visitor = JsonVisitor::default();
        event.record(&mut visitor);

        let mut fields = Value::Object(visitor.fields);
        redact_value(&mut fields);

        let meta = event.metadata();
        let mut line = serde_json::Map::new();
        line.insert(
            "level".to_string(),
            json!(meta.level().to_string().to_lowercase()),
        );
        line.insert(
            "time".to_string(),
            json!(chrono::Utc::now().timestamp_millis()),
        );
        // NEUTRAL service identity, same constant as Node logger.ts SERVICE.
        line.insert("service".to_string(), json!("quiz-socket"));
        line.insert("target".to_string(), json!(meta.target()));

        if let Value::Object(map) = fields {
            for (k, v) in map {
                // pino names the main text field "msg"; tracing calls it "message".
                let key = if k == "message" { "msg".to_string() } else { k };
                line.insert(key, v);
            }
        }

        push(&SERVER_RING, &Value::Object(line).to_string());
    }
}

// ── Dev-gating (parity: authorizeDevRequest in http-routes.ts, requireKey) ──

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut equal = true;
    for (x, y) in a.iter().zip(b.iter()) {
        equal &= x == y;
    }
    equal
}

/// Fail-closed contract for the log downloads (Node `requireKey: true`):
/// - dev mode off            → 404 "not found" (do not reveal the route)
/// - dev on, NO DEV_API_KEY  → 401 "unauthorized" (never serve logs key-less)
/// - dev on, key configured  → token from Authorization: Bearer header (fail-closed
///   on mismatch, no fallback), X-Manager-Token header, or ?token= query,
///   constant-time compared → 401 on mismatch.
fn authorize_log_download(
    headers: &HeaderMap,
    query_token: Option<&str>,
) -> Result<(), (StatusCode, Json<Value>)> {
    if !is_dev_mode() {
        return Err(json_error_response(StatusCode::NOT_FOUND, "not found"));
    }

    let expected = match dev_api_key() {
        Some(k) if !k.is_empty() => k,
        _ => return Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized")),
    };

    // If Authorization header with Bearer schema is present, it is FINAL (no fallback).
    // Mismatch → fail closed. Non-Bearer headers (Basic, etc.) fall through.
    if let Some(auth_header) = headers.get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                return if constant_time_eq(token.as_bytes(), expected.as_bytes()) {
                    Ok(())
                } else {
                    Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"))
                };
            }
        }
    }

    // Fallback: X-Manager-Token header or ?token= query param (Node: header ?? query ?? "").
    let presented = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .or(query_token)
        .unwrap_or("");

    if !constant_time_eq(presented.as_bytes(), expected.as_bytes()) {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"));
    }

    Ok(())
}


// ── Handlers ─────────────────────────────────────────────────────────────────

/// text/plain attachment response (parity: textAttachment in http-routes.ts).
fn text_attachment(filename: &str, body: String) -> (StatusCode, HeaderMap, String) {
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        "text/plain; charset=utf-8".parse().unwrap(),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        format!("attachment; filename=\"{}\"", filename)
            .parse()
            .unwrap(),
    );
    (StatusCode::OK, headers, body)
}

pub async fn handle_logs_server(
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, HeaderMap, String), (StatusCode, Json<Value>)> {
    authorize_log_download(&headers, params.get("token").map(String::as_str))?;
    Ok(text_attachment(
        "server-logs.ndjson",
        lines(&SERVER_RING).join("\n"),
    ))
}

pub async fn handle_logs_client(
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, HeaderMap, String), (StatusCode, Json<Value>)> {
    authorize_log_download(&headers, params.get("token").map(String::as_str))?;
    Ok(text_attachment(
        "client-logs.ndjson",
        lines(&CLIENT_RING).join("\n"),
    ))
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_skips_empty_and_whitespace_lines() {
        let ring = Mutex::new(VecDeque::new());
        push(&ring, "");
        push(&ring, "   ");
        push(&ring, "\n");
        assert!(lines(&ring).is_empty());
    }

    #[test]
    fn push_strips_single_trailing_newline() {
        let ring = Mutex::new(VecDeque::new());
        push(&ring, "{\"msg\":\"a\"}\n");
        assert_eq!(lines(&ring), vec!["{\"msg\":\"a\"}".to_string()]);
    }

    #[test]
    fn ring_is_bounded_fifo() {
        let ring = Mutex::new(VecDeque::new());
        for i in 0..(MAX_LINES + 5) {
            push(&ring, &format!("line-{}", i));
        }
        let all = lines(&ring);
        assert_eq!(all.len(), MAX_LINES);
        // Oldest 5 evicted; the first surviving line is line-5.
        assert_eq!(all[0], "line-5");
        assert_eq!(all[all.len() - 1], format!("line-{}", MAX_LINES + 4));
    }

    #[test]
    fn redact_censors_denylisted_keys_at_all_depths() {
        let mut v = json!({
            "password": "secret",
            "msg": "hello",
            "payload": { "apiKey": "k", "nested": { "token": "t" } },
            "list": [ { "answerText": "42" } ]
        });
        redact_value(&mut v);
        assert_eq!(v["password"], REDACTED);
        assert_eq!(v["msg"], "hello");
        assert_eq!(v["payload"]["apiKey"], REDACTED);
        assert_eq!(v["payload"]["nested"]["token"], REDACTED);
        assert_eq!(v["list"][0]["answerText"], REDACTED);
    }

    #[test]
    fn constant_time_eq_matches_and_rejects() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
        assert!(!constant_time_eq(b"", b"x"));
    }
}
