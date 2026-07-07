//! METRICS.REPORT / METRICS.SUBSCRIBE — low-latency observability (per-room percentile aggregation).
//!
//! Bounded ring buffers + p50/p95 snapshots, emitted to manager on a throttled schedule.
//! Low-latency mode gated: normal mode is an inert no-op (nothing recorded, no host push).
//! Parity: Node metrics.ts exact percentile formula + ringbuf max-sample management.

use super::HandlerCtx;
use razzoozle_protocol::constants;
use razzoozle_protocol::player::{MetricsHealthSnapshot, MetricPercentiles};
use socketioxide::extract::{Data, SocketRef};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const MAX_SAMPLES: usize = 200;
const HEALTH_PUSH_THROTTLE_MS: u64 = 1000;

#[derive(Debug, Clone)]
struct RoomMetrics {
    rtt: Vec<f64>,
    clock_offset: Vec<f64>,
    answer_ack: Vec<f64>,
    reconnect_count: i32,
    rejected: HashMap<String, i32>,
}

impl RoomMetrics {
    fn new() -> Self {
        Self {
            rtt: Vec::new(),
            clock_offset: Vec::new(),
            answer_ack: Vec::new(),
            reconnect_count: 0,
            rejected: HashMap::new(),
        }
    }
}

/// Per-room metrics store: game_id -> (metrics, push_pending flag).
/// Push_pending prevents multiple health pushes within the throttle window.
fn get_metrics_store() -> &'static Mutex<HashMap<String, (RoomMetrics, bool)>> {
    static METRICS_STORE: OnceLock<Mutex<HashMap<String, (RoomMetrics, bool)>>> = OnceLock::new();
    METRICS_STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Append to a bounded ring buffer (drop oldest) — max-sample cap prevents unbounded
/// growth on flaky networks. Parity: Node push() on line 52-58.
fn push_sample(buf: &mut Vec<f64>, value: f64) {
    buf.push(value);
    if buf.len() > MAX_SAMPLES {
        buf.remove(0);
    }
}

/// Percentile using nearest-rank method (matches Node metrics.ts:60-71).
/// Sorts values, computes rank = ceil(p/100 * N) - 1, clamps to range.
fn percentile(values: &[f64], p: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let rank = ((p / 100.0) * sorted.len() as f64).ceil() as usize - 1;
    let index = std::cmp::min(std::cmp::max(rank, 0), sorted.len() - 1);

    Some(sorted[index])
}

/// Build MetricsHealthSnapshot matching the wire shape (Node metrics.ts:104-126).
/// Camel-case wire fields, null for empty buffers, counts always present.
fn build_snapshot(metrics: &RoomMetrics) -> MetricsHealthSnapshot {
    MetricsHealthSnapshot {
        rtt: MetricPercentiles {
            p50: percentile(&metrics.rtt, 50.0).map(|v| v as i32),
            p95: percentile(&metrics.rtt, 95.0).map(|v| v as i32),
            count: metrics.rtt.len() as i32,
        },
        clock_offset: MetricPercentiles {
            p50: percentile(&metrics.clock_offset, 50.0).map(|v| v as i32),
            p95: percentile(&metrics.clock_offset, 95.0).map(|v| v as i32),
            count: metrics.clock_offset.len() as i32,
        },
        answer_ack: MetricPercentiles {
            p50: percentile(&metrics.answer_ack, 50.0).map(|v| v as i32),
            p95: percentile(&metrics.answer_ack, 95.0).map(|v| v as i32),
            count: metrics.answer_ack.len() as i32,
        },
        reconnect_count: metrics.reconnect_count,
        rejected: metrics.rejected.clone(),
    }
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    // METRICS.REPORT: ingest client-measured samples (RTT / clock-offset / ack latency).
    // Resolved by reporter socket membership (player or manager). Crash-guarded to finite
    // numbers, gated by low_latency.enabled, schedules throttled health push.
    // Parity: handlers/game.ts:388-406 + game.ts recordMetric + scheduleHealthPush.
    socket.on(constants::metrics::REPORT, {
        let ctx = ctx.clone();
        let socket_id = socket.id.to_string();

        move |_socket: SocketRef, Data(data): Data<serde_json::Value>| {
            let ctx = ctx.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                // Validate and extract payload: kind (string) and value (finite number).
                let kind = match data.get("kind").and_then(|v| v.as_str()) {
                    Some(k) => k,
                    None => return,
                };

                let value = match data.get("value").and_then(|v| v.as_f64()) {
                    Some(v) if v.is_finite() => v,
                    _ => return, // Invalid, drop silently
                };

                // Resolve game by socket ID (membership-checked API).
                let game_ref = {
                    let registry = ctx.registry.read().await;
                    registry.get_game_by_socket_id(&socket_id)
                };

                let game_ref = match game_ref {
                    Some(g) => g,
                    None => return, // Socket not in any game
                };

                // Check low_latency flag and record metric to store.
                let (game_id, should_push) = {
                    let game = match game_ref.lock() {
                        Ok(g) => g,
                        Err(_) => return, // Lock failed
                    };

                    // Gate: must be enabled to record or push.
                    if !game.low_latency {
                        return;
                    }

                    let game_id = game.game_id.clone();

                    // Update metrics store (create room entry if needed).
                    let store = get_metrics_store();
                    let mut store = store.lock().unwrap();
                    let (metrics, push_pending) = store
                        .entry(game_id.clone())
                        .or_insert_with(|| (RoomMetrics::new(), false));

                    // Record value to appropriate buffer (unknown kinds are silently ignored).
                    match kind {
                        "rtt" => push_sample(&mut metrics.rtt, value),
                        "clockOffset" => push_sample(&mut metrics.clock_offset, value),
                        "answerAck" => push_sample(&mut metrics.answer_ack, value),
                        _ => return, // Future/garbled kind
                    }

                    // Only schedule push if one isn't already pending (throttle).
                    let should_push = !*push_pending;
                    if should_push {
                        *push_pending = true;
                    }

                    (game_id, should_push)
                };

                // If this is the first report in the window, spawn the throttled push task.
                // Parity: game.ts scheduleHealthPush (lines 912-925).
                if should_push {
                    let ctx = ctx.clone();
                    let game_id = game_id.clone();

                    tokio::spawn(async move {
                        tokio::time::sleep(Duration::from_millis(HEALTH_PUSH_THROTTLE_MS)).await;

                        // Mark push_pending false so the next report can schedule a push.
                        {
                            let store = get_metrics_store();
                            let mut store = store.lock().unwrap();
                            if let Some((_, push_pending)) = store.get_mut(&game_id) {
                                *push_pending = false;
                            }
                        }

                        // Build snapshot and send to manager socket only.
                        let (snapshot, manager_socket_id) = {
                            let registry = ctx.registry.read().await;
                            let game_ref = match registry.get_game_by_id(&game_id) {
                                Some(g) => g,
                                None => return,
                            };

                            let game = match game_ref.lock() {
                                Ok(g) => g,
                                Err(_) => return,
                            };

                            // Snapshot current room metrics.
                            let store = get_metrics_store();
                            let store = store.lock().unwrap();
                            let metrics = store
                                .get(&game_id)
                                .map(|(m, _)| m.clone())
                                .unwrap_or_else(RoomMetrics::new);

                            let snapshot = build_snapshot(&metrics);
                            let manager_socket_id = game.manager_socket_id.clone();

                            (snapshot, manager_socket_id)
                        };

                        // Emit only to manager (parse SocketId and emit directly to socket).
                        if let Ok(sid) = manager_socket_id.parse() {
                            if let Some(manager_socket) = ctx.io.get_socket(sid) {
                                manager_socket
                                    .emit(constants::metrics::HEALTH, &snapshot)
                                    .ok();
                            }
                        }
                    });
                }
            });
        }
    });

    // METRICS.SUBSCRIBE: manager opts in to health snapshots for its own game.
    // Sends one immediate snapshot + relies on throttled push for updates.
    // Manager-only (gameId + clientId + socket ID gated); no-op if game not found or LL off.
    // Parity: handlers/game.ts:408-422 + game.ts subscribeMetrics.
    socket.on(constants::metrics::SUBSCRIBE, {
        let ctx = ctx.clone();
        let client_id = ctx.client_id.clone();
        let socket_id = socket.id.to_string();

        move |socket: SocketRef, Data(data): Data<serde_json::Value>| {
            let ctx = ctx.clone();
            let client_id = client_id.clone();
            let socket_id = socket_id.clone();

            tokio::spawn(async move {
                // Validate gameId payload.
                let game_id = match data.get("gameId").and_then(|v| v.as_str()) {
                    Some(id) => id,
                    None => return, // No gameId or wrong type
                };

                // Get game and verify manager ownership + low_latency enabled.
                let snapshot = {
                    let registry = ctx.registry.read().await;
                    let game_ref = match registry.get_game_by_id(game_id) {
                        Some(g) => g,
                        None => return, // Game not found
                    };

                    let game = match game_ref.lock() {
                        Ok(g) => g,
                        Err(_) => return,
                    };

                    // Triple gate (parity: Node game/index.ts:898-908):
                    if !game.low_latency {
                        return;
                    }
                    if game.manager_socket_id != socket_id {
                        return;
                    }
                    if game.manager_client_id.as_ref() != Some(&client_id) {
                        return;
                    }

                    // Build immediate snapshot from current room metrics.
                    let store = get_metrics_store();
                    let store = store.lock().unwrap();
                    let metrics = store
                        .get(game_id)
                        .map(|(m, _)| m.clone())
                        .unwrap_or_else(RoomMetrics::new);

                    build_snapshot(&metrics)
                };

                // Emit snapshot to the requesting (manager) socket.
                socket
                    .emit(constants::metrics::HEALTH, &snapshot)
                    .ok();
            });
        }
    });
}

/// Drop a room's metrics buffers (called on game removal so the store can't leak keys).
/// Parity: Node metrics.clear (line 128-130).
pub fn clear_room(game_id: &str) {
    let store = get_metrics_store();
    let mut store = store.lock().unwrap();
    store.remove(game_id);
}
