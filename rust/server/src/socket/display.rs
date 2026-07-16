//! DISPLAY.REGISTER / PAIR / PING / DISCONNECT — pairing and management of display sockets.

use super::HandlerCtx;
use lazy_static::lazy_static;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const CODE_CHARS: &str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH: usize = 6;
const CODE_TTL_MS: u64 = 600_000; // 10 minutes
const DISPLAY_DEFAULT_NAME: &str = "Beamer";
const DISPLAY_NAME_MAX_LEN: usize = 50;
const DEFAULT_MANAGER_PASSWORD: &str = "PASSWORD";
// W2i — display staleness threshold (matches Node's DISPLAY_STALE_MS from packages/common/src/constants.ts)
const DISPLAY_STALE_MS: u64 = 30_000; // 30 seconds

fn get_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn generate_code() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..CODE_LENGTH)
        .map(|_| {
            let idx = rng.gen_range(0..CODE_CHARS.len());
            CODE_CHARS.chars().nth(idx).unwrap()
        })
        .collect()
}

fn clamp_name(name: Option<&str>) -> String {
    if let Some(n) = name {
        let cleaned = n
            .chars()
            .filter(|c| !c.is_control())
            .collect::<String>()
            .trim()
            .to_string();

        if cleaned.is_empty() {
            return DISPLAY_DEFAULT_NAME.to_string();
        }

        return cleaned.chars().take(DISPLAY_NAME_MAX_LEN).collect();
    }

    DISPLAY_DEFAULT_NAME.to_string()
}

#[derive(Clone, Debug)]
struct PairingCode {
    socket_id: String,
    registered_at: u64,
    name: Option<String>,
}

#[derive(Clone, Debug)]
struct DisplayRecord {
    socket_id: String,
    game_id: String,
    name: String,
    last_ping_at: u64,
}

struct PairingRegistry {
    codes: HashMap<String, PairingCode>,
    displays: HashMap<String, DisplayRecord>,
}

impl PairingRegistry {
    fn new() -> Self {
        Self {
            codes: HashMap::new(),
            displays: HashMap::new(),
        }
    }

    fn register_code(&mut self, code: String, socket_id: String, name: Option<String>) {
        let now = get_now_ms();
        self.prune_stale_codes(now);
        self.codes.insert(
            code,
            PairingCode {
                socket_id,
                registered_at: now,
                name,
            },
        );
    }

    fn get_code(&self, code: &str) -> Option<PairingCode> {
        self.codes.get(code).cloned()
    }

    fn remove_code(&mut self, code: &str) {
        self.codes.remove(code);
    }

    fn prune_stale_codes(&mut self, now: u64) {
        self.codes.retain(|_, pairing| {
            now.saturating_sub(pairing.registered_at) <= CODE_TTL_MS
        });
    }

    fn register_display(&mut self, socket_id: String, game_id: String, name: String) {
        let now = get_now_ms();
        self.displays.insert(
            socket_id.clone(),
            DisplayRecord {
                socket_id,
                game_id,
                name,
                last_ping_at: now,
            },
        );
    }

    fn touch_display(&mut self, socket_id: &str, name: Option<String>) -> bool {
        if let Some(display) = self.displays.get_mut(socket_id) {
            display.last_ping_at = get_now_ms();
            if let Some(n) = name {
                display.name = n;
            }
            return true;
        }
        false
    }

    fn remove_display(&mut self, socket_id: &str) -> Option<String> {
        self.displays
            .remove(socket_id)
            .map(|d| d.game_id)
    }

    fn get_displays_by_game(&self, game_id: &str) -> Vec<DisplayRecord> {
        self.displays
            .values()
            .filter(|d| d.game_id == game_id)
            .cloned()
            .collect()
    }

    // W2i — sweep stale displays: remove displays that haven't pinged within DISPLAY_STALE_MS
    fn sweep_stale_displays(&mut self) {
        let now = get_now_ms();
        let stale_ms = DISPLAY_STALE_MS;
        let mut removed = 0;

        self.displays.retain(|_, display| {
            if now.saturating_sub(display.last_ping_at) > stale_ms {
                removed += 1;
                false
            } else {
                true
            }
        });

        if removed > 0 {
            tracing::info!(
                "Removed {} stale display(s). Remaining: {}",
                removed,
                self.displays.len()
            );
        }
    }

    // W2j — prune stale pairing codes (can be called from periodic sweep)
    fn sweep_stale_codes(&mut self) {
        let now = get_now_ms();
        self.prune_stale_codes(now);
    }
}

lazy_static! {
    static ref PAIRING_REGISTRY: Mutex<PairingRegistry> = Mutex::new(PairingRegistry::new());
}

// W2i + W2j — public entry point for the 60s background sweep task
pub fn sweep_pairing_and_displays() {
    if let Ok(mut registry) = PAIRING_REGISTRY.lock() {
        registry.sweep_stale_codes();
        registry.sweep_stale_displays();
    } else {
        tracing::error!("Failed to acquire PAIRING_REGISTRY lock for sweep");
    }
}

fn broadcast_status(io: socketioxide::SocketIo, registry: std::sync::Arc<tokio::sync::RwLock<crate::state::GameRegistry>>, game_id: String, db_pool: Option<sqlx::PgPool>) {
    tokio::spawn(async move {
        let game_opt = {
            let registry = registry.read().await;
            registry.get_game_by_id(&game_id)
        };

        if let Some(game_ref) = game_opt {
            let manager_socket_id = {
                let game = game_ref.lock().unwrap();
                game.manager_socket_id.clone()
            };

            let displays = {
                let mut pairing = PAIRING_REGISTRY.lock().unwrap();
                pairing.get_displays_by_game(&game_id)
            };

            let display_list: Vec<serde_json::Value> = displays
                .iter()
                .map(|d| {
                    serde_json::json!({
                        "socketId": d.socket_id,
                        "name": d.name,
                        "lastPingAt": d.last_ping_at,
                    })
                })
                .collect();

            // Emit STATUS directly to the manager via get_socket (manager_socket_id is not auto-joined to its SID room)
            if let Ok(sid) = manager_socket_id.parse() {
                if let Some(manager_socket) = io.get_socket(sid) {
                    manager_socket
                        .emit(
                            constants::display::STATUS,
                            &serde_json::json!({ "displays": display_list }),
                        )
                        .ok();
                }
            }
        }
    });
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    // Handle DISPLAY.REGISTER — register a display and get a pairing code
    socket.on(constants::display::REGISTER, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(data)| {
            let code = generate_code();
            let name = data
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| clamp_name(Some(s)));

            {
                let mut pairing = PAIRING_REGISTRY.lock().unwrap();
                pairing.register_code(code.clone(), socket.id.to_string(), name);
            }

            socket
                .emit(constants::display::REGISTERED, &serde_json::json!({ "code": code }))
                .ok();
        }
    });

    // Handle DISPLAY.PAIR — pair display to game by code
    socket.on(constants::display::PAIR, {
        let io = ctx.io.clone();
        let registry = ctx.registry.clone();
        let db_pool = ctx.db_pool.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let code_opt = payload.get("code").and_then(|v| v.as_str()).map(|s| s.to_string());
            let game_id_opt = payload
                .get("gameId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let manager_password_opt = payload
                .get("managerPassword")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if let (Some(code), Some(game_id)) = (code_opt, game_id_opt) {
                let socket_id = socket.id.to_string();
                let code_clone = code.clone();
                let game_id_clone = game_id.clone();

                let io_clone = io.clone();
                let registry_clone = registry.clone();
                let db_pool_clone = db_pool.clone();

                tokio::spawn(async move {
                    // Validate code exists
                    let pairing = {
                        let pairing_reg = PAIRING_REGISTRY.lock().unwrap();
                        pairing_reg.get_code(&code_clone)
                    };

                    let Some(pairing_data) = pairing else {
                        socket
                            .emit(constants::display::PAIR_ERROR, "errors:display.invalidCode")
                            .ok();
                        return;
                    };

                    // Validate game exists
                    let game_ref = {
                        let reg = registry_clone.read().await;
                        reg.get_game_by_id(&game_id_clone)
                    };

                    let Some(game_ref) = game_ref else {
                        socket
                            .emit(constants::display::PAIR_ERROR, "errors:game.notFound")
                            .ok();
                        return;
                    };

                    // Validate manager identity or password
                    let manager_socket_id = {
                        let game = game_ref.lock().unwrap();
                        game.manager_socket_id.clone()
                    };

                    if manager_socket_id != socket_id {
                        // Caller is not the manager, validate password
                        let expected_password = crate::db::get_manager_password(&db_pool_clone)
                            .await
                            .unwrap_or_else(|| {
                                std::env::var("MANAGER_PASSWORD")
                                    .unwrap_or_else(|_| DEFAULT_MANAGER_PASSWORD.to_string())
                            });

                        let valid_password = if expected_password == DEFAULT_MANAGER_PASSWORD {
                            false
                        } else {
                            let provided = manager_password_opt.as_deref().unwrap_or("");
                            // Constant-time comparison
                            provided.len() == expected_password.len()
                                && provided
                                    .as_bytes()
                                    .iter()
                                    .zip(expected_password.as_bytes())
                                    .fold(0, |acc, (a, b)| acc | (a ^ b))
                                    == 0
                        };

                        if !valid_password {
                            socket
                                .emit(
                                    constants::display::PAIR_ERROR,
                                    "errors:manager.invalidPassword",
                                )
                                .ok();
                            return;
                        }
                    }

                    // Get display socket from pairing record
                    let display_socket = io_clone.get_socket(pairing_data.socket_id.parse().unwrap());

                    let Some(display_socket) = display_socket else {
                        socket
                            .emit(
                                constants::display::PAIR_ERROR,
                                "errors:display.notConnected",
                            )
                            .ok();
                        return;
                    };

                    // Remove code (single-use)
                    {
                        let mut pairing_reg = PAIRING_REGISTRY.lock().unwrap();
                        pairing_reg.remove_code(&code_clone);
                    }

                    // Join display socket to game room
                    display_socket.join(game_id_clone.clone());

                    // Emit PAIR_SUCCESS to both sockets
                    display_socket
                        .emit(
                            constants::display::PAIR_SUCCESS,
                            &serde_json::json!({ "gameId": game_id_clone }),
                        )
                        .ok();
                    socket
                        .emit(
                            constants::display::PAIR_SUCCESS,
                            &serde_json::json!({ "gameId": game_id_clone }),
                        )
                        .ok();

                    // Register display record with heartbeat
                    let display_name = pairing_data.name.unwrap_or_else(|| clamp_name(None));
                    {
                        let mut pairing_reg = PAIRING_REGISTRY.lock().unwrap();
                        pairing_reg.register_display(
                            pairing_data.socket_id.clone(),
                            game_id_clone.clone(),
                            display_name,
                        );
                    }

                    // Broadcast status
                    broadcast_status(
                        io_clone,
                        registry_clone,
                        game_id_clone,
                        db_pool_clone,
                    );
                });
            }
        }
    });

    // Handle DISPLAY.PING — heartbeat from paired display
    socket.on(constants::display::PING, {
        let io = ctx.io.clone();
        let registry = ctx.registry.clone();
        let db_pool = ctx.db_pool.clone();

        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let socket_id = _socket.id.to_string();
            let game_id_opt = payload
                .get("gameId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let name_opt = payload.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());

            if let Some(game_id) = game_id_opt {
                let io_clone = io.clone();
                let registry_clone = registry.clone();
                let db_pool_clone = db_pool.clone();

                tokio::spawn(async move {
                    // Update heartbeat
                    {
                        let mut pairing = PAIRING_REGISTRY.lock().unwrap();
                        let new_name = name_opt.as_deref().map(|n| clamp_name(Some(n)));
                        pairing.touch_display(&socket_id, new_name);
                    }

                    // Broadcast status
                    broadcast_status(
                        io_clone,
                        registry_clone,
                        game_id,
                        db_pool_clone,
                    );
                });
            }
        }
    });

    // Handle DISPLAY.DISCONNECT — unregister pairing code
    socket.on(constants::display::DISCONNECT, {
        move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let code_opt = payload.get("code").and_then(|v| v.as_str());

            if let Some(code) = code_opt {
                let mut pairing = PAIRING_REGISTRY.lock().unwrap();
                pairing.remove_code(code);
            }
        }
    });

    // Handle socket disconnect
    socket.on("disconnect", {
        let io = ctx.io.clone();
        let registry = ctx.registry.clone();
        let db_pool = ctx.db_pool.clone();

        move |_socket: SocketRef| {
            let socket_id = _socket.id.to_string();

            let io_clone = io.clone();
            let registry_clone = registry.clone();
            let db_pool_clone = db_pool.clone();

            tokio::spawn(async move {
                // Get game_id before removing
                let game_id_opt = {
                    let mut pairing = PAIRING_REGISTRY.lock().unwrap();
                    pairing.remove_display(&socket_id)
                };

                // Broadcast status if display was removed
                if let Some(game_id) = game_id_opt {
                    broadcast_status(
                        io_clone,
                        registry_clone,
                        game_id,
                        db_pool_clone,
                    );
                }
            });
        }
    });
}
