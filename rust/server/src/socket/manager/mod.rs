//! MANAGER.* — manager/quiz-host control handlers

use super::HandlerCtx;
use socketioxide::extract::SocketRef;

pub mod auth;
pub mod catalog;
pub mod config;
pub mod config_helper;
pub mod game_flow;
pub mod game_state;
pub mod games_list;
pub mod players;
pub mod public;
pub mod media;
pub mod quizz;
pub mod submissions;
pub mod theme;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    auth::register(socket, ctx.clone());
    catalog::register(socket, ctx.clone());
    config::register(socket, ctx.clone());
    game_flow::register(socket, ctx.clone());
    game_state::register(socket, ctx.clone());
    games_list::register(socket, ctx.clone());
    players::register(socket, ctx.clone());
    public::register(socket, ctx.clone());
    media::register(socket, ctx.clone());
    quizz::register(socket, ctx.clone());
    submissions::register(socket, ctx.clone());
    theme::register(socket, ctx.clone());
}
