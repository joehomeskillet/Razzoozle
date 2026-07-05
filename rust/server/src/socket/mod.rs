//! socket/ — one file per socket.io event handler (state-of-the-art modular layout
//! for agent-friendly parallel development: a worker editing one handler cannot touch
//! another). Each handler file exposes `pub fn register(socket: &SocketRef, ctx: HandlerCtx)`
//! and registers its own `socket.on(...)`. main.rs stays thin and calls `register_all`.

use crate::state::GameRegistry;
use socketioxide::{extract::SocketRef, SocketIo};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Everything a handler closure needs, captured once at connect and cloned per handler.
#[derive(Clone)]
pub struct HandlerCtx {
    pub registry: Arc<RwLock<GameRegistry>>,
    pub io: SocketIo,
    pub client_id: String,
}

pub mod clock_ping;
pub mod display;
pub mod metrics;

/// Register every extracted handler on a freshly-connected socket.
/// Handlers still inline in main.rs are registered there until they migrate here.
pub fn register_all(socket: &SocketRef, ctx: &HandlerCtx) {
    clock_ping::register(socket, ctx.clone());
    display::register(socket, ctx.clone());
    metrics::register(socket, ctx.clone());
}
