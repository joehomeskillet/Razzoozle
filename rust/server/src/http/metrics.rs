/// Prometheus metrics endpoint — same metric names and labels as Node for dashboard/alerting compatibility
/// localhost-only gating is handled by nginx; this handler just renders the metrics.

use axum::http::StatusCode;
use axum::response::IntoResponse;
use lazy_static::lazy_static;
use prometheus::{Counter, CounterVec, Encoder, Gauge, GaugeVec, Histogram, HistogramVec, IntCounter, IntCounterVec, IntGaugeVec, Registry, TextEncoder};
use std::sync::Mutex;

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

/// GET /metrics — Prometheus text-exposition format
/// Localhost-only access is enforced by nginx (DEV-gated, never in prod)
pub async fn handle_metrics() -> impl IntoResponse {
    let metrics = REGISTRY.gather();
    let mut buffer = vec![];
    TextEncoder.encode(&metrics, &mut buffer).ok();

    (
        StatusCode::OK,
        [("Content-Type", "text/plain; version=0.0.4; charset=utf-8")],
        String::from_utf8(buffer).unwrap_or_default(),
    )
}
