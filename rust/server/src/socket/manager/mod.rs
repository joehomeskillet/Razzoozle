//! MANAGER.* — manager/quiz-host control handlers

use super::HandlerCtx;
use socketioxide::extract::SocketRef;

pub mod auth;
pub mod game_flow;
pub mod game_state;
pub mod players;
pub mod public;
pub mod media;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    auth::register(socket, ctx.clone());
    game_flow::register(socket, ctx.clone());
    game_state::register(socket, ctx.clone());
    players::register(socket, ctx.clone());
    public::register(socket, ctx.clone());
    media::register(socket, ctx.clone());
}
