//! FlowerBattle power-up vote handlers (WP #931 / SEC-01).
//!
//! C2S:
//! - `player:flowerBattle:submitPowerupVote`
//! - `player:flowerBattle:submitPowerupTargetVote`
//!
//! Votes are stored in-memory on [`Game::flower_battle_votes`] (keyed by team).
//! Evaluation is lifecycle-driven (`VoteState::evaluate_at`, WP #933) — no
//! timer threads here. Denied paths always log `warn!` and emit a visible
//! client error event (never silent).
//!
//! SEC-01: every vote is gated on `playerToken` (same semantics as answer
//! SEC-04 / `answer_token_gate`). clientId alone is not auth.

use super::answer::answer_token_gate;
use super::HandlerCtx;
use razzoozle_engine::flower_battle::{
    is_eligible_voter, validate_target_choice, VoteChoice, VoteKind,
};
use razzoozle_protocol::constants;
use razzoozle_protocol::experience::{PowerupVotePayload, TargetVotePayload};
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};

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
            let player_token = payload.player_token.clone();

            tokio::spawn(async move {
                handle_powerup_vote_inner(
                    socket,
                    registry,
                    client_id,
                    game_id,
                    option_index,
                    player_token,
                )
                .await;
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
            let player_token = payload.player_token.clone();

            tokio::spawn(async move {
                handle_powerup_target_vote_inner(
                    socket,
                    registry,
                    client_id,
                    game_id,
                    target_team_id,
                    player_token,
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
    player_token: String,
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

    // SEC-01: token↔player match. clientId is client-controlled and alone is
    // not auth. Pattern mirrors answer.rs:107-119.
    if !answer_token_gate(player.player_token.as_deref(), Some(player_token.as_str())) {
        drop(game);
        tracing::warn!(
            "submitPowerupVote denied: playerToken mismatch/missing (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    }

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
    player_token: String,
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

    // SEC-01: token↔player match (same as submitPowerupVote / answer SEC-04).
    if !answer_token_gate(player.player_token.as_deref(), Some(player_token.as_str())) {
        drop(game);
        tracing::warn!(
            "submitPowerupTargetVote denied: playerToken mismatch/missing (game={}, client_id={})",
            game_id,
            client_id
        );
        emit_denied(&socket, "errors:game.invalidAnswer");
        return;
    }

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

// ---------------------------------------------------------------------------
// SEC-01 pure gate tests (socket-free; mirrors answer.rs token gate)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::answer_token_gate;
    use razzoozle_engine::flower_battle::{VoteChoice, VoteState};

    /// SEC-01 decision for a power-up vote: whether the supplied token may vote
    /// for the player identified by `client_id` (looked up → stored token).
    ///
    /// Same predicate as the live handlers (`answer_token_gate`); Result form is
    /// only for assert-friendly unit tests.
    fn powerup_vote_token_check(
        stored_token: Option<&str>,
        supplied_token: &str,
    ) -> Result<(), &'static str> {
        if answer_token_gate(stored_token, Some(supplied_token)) {
            Ok(())
        } else {
            Err("playerToken mismatch/missing")
        }
    }

    /// SEC-01 Negativ: team of 2 players with valid tokens.
    /// Vote with Player-A clientId but Player-B token → REJECT.
    /// Vote with Player-A clientId and Player-A token → ACCEPT (and VoteState records).
    #[test]
    fn token_mismatch_rejects_foreign_token_accepts_own() {
        // Setup: Team with 2 players, both with valid tokens.
        let token_a = "token-player-a";
        let token_b = "token-player-b";
        // Stored token for the player who owns client_id "client-a".
        let stored_for_a = Some(token_a);

        // Vote-1: client A, payload player_token = B → REJECT
        let r1 = powerup_vote_token_check(stored_for_a, token_b);
        assert_eq!(r1, Err("playerToken mismatch/missing"));

        // Vote-2: client A, payload player_token = A → ACCEPT
        let r2 = powerup_vote_token_check(stored_for_a, token_a);
        assert_eq!(r2, Ok(()));

        // On accept, VoteState records the vote under client-a (engine path).
        let mut state = VoteState::new_powerup(
            10_000,
            42,
            vec!["sunbeam".into(), "fertilizer".into(), "acid_rain".into()],
            "red",
        );
        assert!(state
            .vote(
                String::from("client-a"),
                VoteChoice::PowerupOption(0),
                1_000
            )
            .is_ok());
        assert_eq!(
            state.votes.get("client-a"),
            Some(&VoteChoice::PowerupOption(0))
        );
        // Foreign-token path never reaches vote(): votes map stays size 1.
        assert_eq!(state.votes.len(), 1);
    }

    #[test]
    fn token_gate_denies_empty_supplied_when_stored() {
        assert_eq!(
            powerup_vote_token_check(Some("tok"), ""),
            Err("playerToken mismatch/missing")
        );
    }

    #[test]
    fn token_gate_allows_legacy_player_without_stored_token() {
        // Snapshot-restore pre-token era: stored None → allow any supplied.
        assert_eq!(powerup_vote_token_check(None, "anything"), Ok(()));
    }
}
