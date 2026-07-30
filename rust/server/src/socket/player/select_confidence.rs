use super::HandlerCtx;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::player::PlayerSelectConfidence;
use socketioxide::extract::{Data, SocketRef};

/// Registers `player:selectConfidence` — optional pyramid confidence after the regular answer.
///
/// Gate: `game.engine.phase == GamePhase::ShowResult` only.
/// TODO: extend gate when ExperiencePhase supports post-answer confidence UI.
pub(super) fn register_select_confidence(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::SELECT_CONFIDENCE, {
        let registry = ctx.registry.clone();
        let client_id = ctx.client_id.clone();

        move |socket: SocketRef, Data::<PlayerSelectConfidence>(payload)| {
            let registry = registry.clone();
            let client_id = client_id.clone();
            let game_id = payload.game_id.clone();
            let confidence = payload.confidence;

            tokio::spawn(async move {
                let game_opt = {
                    let registry = registry.read().await;
                    registry.get_game_by_id(&game_id)
                };

                let Some(game_ref) = game_opt else {
                    tracing::warn!(
                        "selectConfidence denied: game not found (game={}, client_id={})",
                        game_id,
                        client_id
                    );
                    socket
                        .emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer")
                        .ok();
                    return;
                };

                let phase = {
                    let game = game_ref.lock().unwrap();
                    game.engine.phase
                };

                if phase != GamePhase::ShowResult {
                    tracing::warn!(
                        "selectConfidence denied: invalid phase {:?} (game={}, client_id={})",
                        phase,
                        game_id,
                        client_id
                    );
                    socket
                        .emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer")
                        .ok();
                    return;
                }

                // Stub: accept only; persistence, team tally (#880), and scoring are out of scope.
                tracing::debug!(
                    "selectConfidence accepted (stub): game={}, client_id={}, confidence={:?}",
                    game_id,
                    client_id,
                    confidence
                );
            });
        }
    });
}
