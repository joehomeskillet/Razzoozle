/// Prometheus metrics endpoint — same metric names and labels as Node for dashboard/alerting compatibility.
/// Auth: DEV_API_KEY via X-Manager-Token (fail-closed). Localhost-only is nginx's job.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use lazy_static::lazy_static;
use prometheus::{Encoder, IntCounterVec, IntGaugeVec, HistogramVec, Registry, TextEncoder};

use super::{authorize_dev_request, AppState};
use axum::middleware;
use axum::extract::Request;

lazy_static! {
    /// Global Prometheus registry for all metrics
    static ref REGISTRY: Registry = Registry::new();

    /// Socket.io events processed, by event name and role
    /// Parity: Node prom.ts:21-26
    pub static ref SOCKET_EVENTS_TOTAL: IntCounterVec = {
        let counter = IntCounterVec::new(
            prometheus::Opts::new("socket_events_total", "Socket.io events processed, by event name and role."),
            &["event", "role"]
        ).unwrap();
        REGISTRY.register(Box::new(counter.clone())).ok();
        counter
    };

    /// Client telemetry events ingested via /api/v1/client-events, by type
    /// Parity: Node prom.ts:28-33
    pub static ref CLIENT_EVENTS_TOTAL: IntCounterVec = {
        let counter = IntCounterVec::new(
            prometheus::Opts::new("client_events_total", "Client telemetry events ingested via /api/v1/client-events, by type."),
            &["type"]
        ).unwrap();
        REGISTRY.register(Box::new(counter.clone())).ok();
        counter
    };

    /// Answers rejected by the round manager, by reason
    /// Parity: Node prom.ts:35-40
    pub static ref ANSWERS_REJECTED_TOTAL: IntCounterVec = {
        let counter = IntCounterVec::new(
            prometheus::Opts::new("answers_rejected_total", "Answers rejected by the round manager, by reason."),
            &["reason"]
        ).unwrap();
        REGISTRY.register(Box::new(counter.clone())).ok();
        counter
    };

    /// HTTP requests served, by route and status
    /// Parity: Node prom.ts:42-47
    pub static ref HTTP_REQUESTS_TOTAL: IntCounterVec = {
        let counter = IntCounterVec::new(
            prometheus::Opts::new("http_requests_total", "HTTP requests served, by route and status."),
            &["route", "status"]
        ).unwrap();
        REGISTRY.register(Box::new(counter.clone())).ok();
        counter
    };

    /// Answer-ack latency (ms) — observed only in low-latency mode
    /// Parity: Node prom.ts:50-55
    pub static ref ANSWER_ACK_LATENCY_MS: HistogramVec = {
        let histogram = HistogramVec::new(
            prometheus::HistogramOpts {
                common_opts: prometheus::Opts::new("answer_ack_latency_ms", "Server-measured answer-ack latency (ms). Observed only in low-latency mode."),
                buckets: vec![5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0],
            },
            &[]
        ).unwrap();
        REGISTRY.register(Box::new(histogram.clone())).ok();
        histogram
    };

    /// Clock round-trip time (ms) — observed only in low-latency mode
    /// Parity: Node prom.ts:57-62
    pub static ref CLOCK_RTT_MS: HistogramVec = {
        let histogram = HistogramVec::new(
            prometheus::HistogramOpts {
                common_opts: prometheus::Opts::new("clock_rtt_ms", "Client-reported clock round-trip time (ms). Observed only in low-latency mode."),
                buckets: vec![5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0],
            },
            &[]
        ).unwrap();
        REGISTRY.register(Box::new(histogram.clone())).ok();
        histogram
    };

    /// Connected sockets, by role
    /// Parity: Node prom.ts:65-70
    pub static ref CONNECTED_SOCKETS: IntGaugeVec = {
        let gauge = IntGaugeVec::new(
            prometheus::Opts::new("connected_sockets", "Number of connected sockets, by role."),
            &["role"]
        ).unwrap();
        REGISTRY.register(Box::new(gauge.clone())).ok();
        gauge
    };
}

/// Per-route HTTP request counter middleware (Node parity: prom.ts instrumentation).
/// Tracks route + status code, increments http_requests_total on every response.
pub async fn track_metrics(req: Request, next: middleware::Next) -> axum::response::Response {
    let route = req.extensions()
        .get::<axum::extract::MatchedPath>()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| "unmatched".into());
    
    let resp = next.run(req).await;
    
    // Increment counter with [route, status_code] labels (Node parity)
    HTTP_REQUESTS_TOTAL.with_label_values(&[&route, resp.status().as_str()]).inc();
    
    resp
}

/// GET /metrics — Prometheus text-exposition format.
/// Requires `X-Manager-Token` matching `DEV_API_KEY` (401 if missing/wrong/unset).
/// Tracks http_requests_total per route and status code via middleware layer.
pub async fn handle_metrics(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if !authorize_dev_request(&headers, state.registry.clone()).await {
        return (
            StatusCode::UNAUTHORIZED,
            [("Content-Type", "text/plain; charset=utf-8")],
            "unauthorized".to_string(),
        )
            .into_response();
    }

    let metrics = REGISTRY.gather();
    let mut buffer = vec![];
    TextEncoder.encode(&metrics, &mut buffer).ok();

    (
        StatusCode::OK,
        [("Content-Type", "text/plain; version=0.0.4; charset=utf-8")],
        String::from_utf8(buffer).unwrap_or_default(),
    )
        .into_response()
}
