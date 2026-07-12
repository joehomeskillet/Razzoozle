//! socket/ — one file per socket.io event handler (state-of-the-art modular layout
//! for agent-friendly parallel development: a worker editing one handler cannot touch
//! another). Each handler file exposes `pub fn register(socket: &SocketRef, ctx: HandlerCtx)`
//! and registers its own `socket.on(...)`. main.rs stays thin and calls `register_all`.

use crate::state::GameRegistry;
use crate::db::users::AuthUser;
use socketioxide::{extract::SocketRef, SocketIo};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Everything a handler closure needs, captured once at connect and cloned per handler.
#[derive(Clone)]
pub struct HandlerCtx {
    pub registry: Arc<RwLock<GameRegistry>>,
    pub io: SocketIo,
    pub client_id: String,
    pub db_pool: Option<sqlx::PgPool>,
    /// Session token from handshake auth payload (None if not provided).
    pub session_token: Option<String>,
    /// Lazily-resolved and cached user. Populated on first require_user/require_admin call.
    pub user_cache: Arc<RwLock<Option<AuthUser>>>,
}

impl HandlerCtx {
    /// Resolve and cache the user if not already cached. Returns Some(&user) if valid session, None otherwise.
    /// Call this before operations that require authentication.
    pub async fn require_user(&self) -> Option<AuthUser> {
        // Check cache first (read lock, non-blocking)
        {
            let cache = self.user_cache.read().await;
            if cache.is_some() {
                return cache.clone();
            }
        }

        // Not cached; try to resolve from token
        if let Some(ref token) = self.session_token {
            if let Some(ref pool) = self.db_pool {
                if let Ok(Some(user)) = crate::db::users::session_user(pool, token).await {
                    // Cache it
                    let mut cache = self.user_cache.write().await;
                    *cache = Some(user.clone());
                    return cache.clone();
                }
            }
        }

        None
    }

    /// Require admin role: return Some(user) if logged in AND role=="admin", None otherwise.
    pub async fn require_admin(&self) -> Option<AuthUser> {
        self.require_user().await.and_then(|u| {
            if u.role == "admin" {
                Some(u)
            } else {
                None
            }
        })
    }
}

// AI submodules (used by ai handler)
pub mod ai_provider;
pub mod ai_config;
pub mod ai_validate;
pub mod ai_http;
pub mod ai_utils;
pub mod ai_ratelimit;
pub mod ai_secrets;

pub mod ai;
pub mod clock_ping;
pub mod cooldown;
pub mod display;
pub mod game;
pub mod lifecycle;
pub mod manager;
pub mod metrics;
pub mod results;
pub mod player;
pub mod reveal_helpers;
pub mod status_emit;
pub mod validation;

/// Register every extracted handler on a freshly-connected socket.
/// Handlers still inline in main.rs are registered there until they migrate here.
pub fn register_all(socket: &SocketRef, ctx: &HandlerCtx) {
    ai::register(socket, ctx.clone());
    clock_ping::register(socket, ctx.clone());
    display::register(socket, ctx.clone());
    game::register(socket, ctx.clone());
    manager::register(socket, ctx.clone());
    metrics::register(socket, ctx.clone());
    results::register(socket, ctx.clone());
    player::register(socket, ctx.clone());
}
