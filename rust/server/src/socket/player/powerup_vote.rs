//! FlowerBattle power-up vote handlers (WP #931).
//!
//! C2S:
//! - `player:flowerBattle:submitPowerupVote`
//! - `player:flowerBattle:submitPowerupTargetVote`
//!
//! Votes are stored in-memory on [`Game::flower_battle_votes`] (keyed by team).
//! Evaluation is lifecycle-driven (`VoteState::evaluate_at`, WP #933) — no
//! timer threads here. Denied paths always log `warn!` and emit a visible
//! client error event (never silent).

use super::HandlerCtx;
use razzoozle_engine::flower_battle::{
    is_eligible_voter, validate_target_choice, VoteChoice, VoteKind,
};
use razzoozle_protocol::constants;
use serde::Deserialize;
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Wire payloads (typed trust-boundary — never raw Value)
// ---------------------------------------------------------------------------

/// C2S payload for `player:flowerBattle:submitPowerupVote`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerupVotePayload {
    pub game_id: String,
    /// Index into the active offer option list.
    pub option_index: usize,
}

/// C2S payload for `player:flowerBattle:submitPowerupTargetVote`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetVotePayload {
    pub game_id: String,
    pub target_team_id: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn emit_denied(socket: &SocketRef, reason_key: &str) {
    socket.emit(constants::game::ERROR_MESSAGE, reason_key).ok();
}

/// Register both FlowerBattle power-up vote socket handlers.
pub(super) fn register_powerup_vote(socket: &SocketRef, ctx: HandlerCtx) {
    register_submit_powerup_vote(socket, ctx.clone());
    register_submit_powerup_target_vote(socket, ctx);
}

fn register_submit_powerup_vote(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::flower_battle::SUBMIT_POWERUP_VOTE, {
        let registry = ctx.registry.clone();
        let client_id = ctx.client_id.clone();

        move |socket: SocketRef, Data::<PowerupVotePayload>(payload)| {
            let registry = registry.clone();
            let client_id = client_id.clone();
            let game_id = payload.game_id.clone();
            let option_index = payload.option_index;

            tokio::spawn(async move {
                handle_powerup_vote_inner(socket, registry, client_id, game_id, option_index).await;
            });
        }
    });
}

fn register_submit_powerup_target_vote(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::flower_battle::SUBMIT_POWERUP_TARGET_VOTE, {
        let registry = ctx.registry.clone();
        let client_id = ctx.client_id.clone();

        move |socket: SocketRef, Data::<TargetVotePayload>(payload)| {
            let registry = registry.clone();
            let client_id = client_id.clone();
            let game_id = payload.game_id.clone();
            let target_team_id = payload.target_team_id.clone();

            tokio::spawn(async move {
                handle_powerup_target_vote_inner(
                    socket,
                    registry,
                    client_id,
                    game_id,
                    target_team_id,
                )
                .await;
            });
        }
    });
}

async fn handle_powerup_vote_inner(
    socket: SocketRef,
    registry: std::sync::Arc<tokio::sync::RwLock<crate::state::GameRegistry>>,
    client_id: String,
    game_id: String,
    option_index: usize,
) {
    let game_opt = {
        let registry = registry.read().await;
        registry.get_game_by_id(&game_id)
    };

    let Some(game_ref) = game_opt else {
        tracing::warn!(
            "submitPowerupVote denied: game not found (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    let now = now_ms();
    let mut game = game_ref.lock().unwrap();

    let Some(player) = game.players.iter().find(|p| p.client_id == client_id) else {
        tracing::warn!(
            "submitPowerupVote denied: player not in game (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    let is_bot = player.is_bot.unwrap_or(false);
    let connected = player.connected;
    if !is_eligible_voter(is_bot, connected) {
        tracing::warn!(
            "submitPowerupVote denied: ineligible voter is_bot={} connected={} (game={}, client_id={})",
            is_bot,
            connected,
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    }

    let Some(team_id) = player.team_id.clone() else {
        tracing::warn!(
            "submitPowerupVote denied: no team (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    let Some(vote_state) = game.flower_battle_votes.get_mut(&team_id) else {
        tracing::warn!(
            "submitPowerupVote denied: no active power-up offer (game={}, team={}, client_id={})",
            game_id,
            team_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    if vote_state.kind != VoteKind::Powerup {
        tracing::warn!(
            "submitPowerupVote denied: wrong vote phase {:?} (game={}, team={}, client_id={})",
            vote_state.kind,
            game_id,
            team_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    }

    match vote_state.vote(
        client_id.clone(),
        VoteChoice::PowerupOption(option_index),
        now,
    ) {
        Ok(()) => {
            tracing::debug!(
                "submitPowerupVote accepted: game={}, team={}, client_id={}, option_index={}",
                game_id,
                team_id,
                client_id,
                option_index
            );
        }
        Err(e) => {
            tracing::warn!(
                "submitPowerupVote denied: {} (game={}, team={}, client_id={}, option_index={})",
                e,
                game_id,
                team_id,
                client_id,
                option_index
            );
            emit_denied(&socket, "errors:game.invalidAnswer");
        }
    }
}

async fn handle_powerup_target_vote_inner(
    socket: SocketRef,
    registry: std::sync::Arc<tokio::sync::RwLock<crate::state::GameRegistry>>,
    client_id: String,
    game_id: String,
    target_team_id: String,
) {
    let game_opt = {
        let registry = registry.read().await;
        registry.get_game_by_id(&game_id)
    };

    let Some(game_ref) = game_opt else {
        tracing::warn!(
            "submitPowerupTargetVote denied: game not found (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    let now = now_ms();
    let mut game = game_ref.lock().unwrap();

    let Some(player) = game.players.iter().find(|p| p.client_id == client_id) else {
        tracing::warn!(
            "submitPowerupTargetVote denied: player not in game (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    let is_bot = player.is_bot.unwrap_or(false);
    let connected = player.connected;
    if !is_eligible_voter(is_bot, connected) {
        tracing::warn!(
            "submitPowerupTargetVote denied: ineligible voter is_bot={} connected={} (game={}, client_id={})",
            is_bot,
            connected,
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    }

    let Some(attacker_team_id) = player.team_id.clone() else {
        tracing::warn!(
            "submitPowerupTargetVote denied: no team (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    // Trust-boundary: never rely on client for self/repeat — always re-check.
    let prev = game
        .flower_battle_previous_attacker
        .get(&target_team_id)
        .and_then(|p| p.as_deref());
    if let Err(e) = validate_target_choice(&attacker_team_id, &target_team_id, prev) {
        tracing::warn!(
            "submitPowerupTargetVote denied: {} (game={}, attacker={}, target={}, client_id={})",
            e,
            game_id,
            attacker_team_id,
            target_team_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    }

    // Clone before mut-borrow of flower_battle_votes (disjoint-field NLL is not always free).
    let previous_snapshot = game.flower_battle_previous_attacker.clone();

    let Some(vote_state) = game.flower_battle_votes.get_mut(&attacker_team_id) else {
        tracing::warn!(
            "submitPowerupTargetVote denied: no active target vote (game={}, team={}, client_id={})",
            game_id,
            attacker_team_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    };

    if vote_state.kind != VoteKind::Target {
        tracing::warn!(
            "submitPowerupTargetVote denied: wrong vote phase {:?} (game={}, team={}, client_id={})",
            vote_state.kind,
            game_id,
            attacker_team_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    }

    // Keep VoteState's previous_attacker map in sync with game map before vote.
    vote_state.previous_attacker_by_team = previous_snapshot;

    match vote_state.vote(
        client_id.clone(),
        VoteChoice::TargetTeam(target_team_id.clone()),
        now,
    ) {
        Ok(()) => {
            tracing::debug!(
                "submitPowerupTargetVote accepted: game={}, team={}, target={}, client_id={}",
                game_id,
                attacker_team_id,
                target_team_id,
                client_id
            );
        }
        Err(e) => {
            tracing::warn!(
                "submitPowerupTargetVote denied: {} (game={}, team={}, target={}, client_id={})",
                e,
                game_id,
                attacker_team_id,
                target_team_id,
                client_id
            );
            emit_denied(&socket, "errors:game.invalidAnswer");
        }
    }
}

/// Public entry used by tests / future call-sites (WP contract name).
pub async fn handle_powerup_vote(
    socket: SocketRef,
    registry: std::sync::Arc<tokio::sync::RwLock<crate::state::GameRegistry>>,
    payload: PowerupVotePayload,
    client_id: String,
) {
    handle_powerup_vote_inner(
        socket,
        registry,
        client_id,
        payload.game_id,
        payload.option_index,
    )
    .await;
}

/// Public entry used by tests / future call-sites (WP contract name).
pub async fn handle_powerup_target_vote(
    socket: SocketRef,
    registry: std::sync::Arc<tokio::sync::RwLock<crate::state::GameRegistry>>,
    payload: TargetVotePayload,
    client_id: String,
) {
    handle_powerup_target_vote_inner(
        socket,
        registry,
        client_id,
        payload.game_id,
        payload.target_team_id,
    )
    .await;
}
