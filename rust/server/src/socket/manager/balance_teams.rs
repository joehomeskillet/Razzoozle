//! manager:balanceTeams — host rebalance of lobby teams (WP #952).
//!
//! Pure helpers (`smallest_team`, `plan_balance`) are unit-tested here and reused
//! by player login / selectTeam for auto-assignment.

use super::super::HandlerCtx;
use crate::is_game_host;
use crate::state::TEAMS;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use tracing::warn;

/// Count of connected players currently on each TEAMS slot (unassigned ignored).
pub(crate) fn team_counts(players: &[(bool, Option<&str>)]) -> [usize; 4] {
    let mut counts = [0usize; 4];
    for (connected, team) in players {
        if !*connected {
            continue;
        }
        if let Some(tid) = team {
            if let Some(i) = TEAMS.iter().position(|t| t == tid) {
                counts[i] += 1;
            }
        }
    }
    counts
}

/// Smallest TEAMS entry by connected-player count. Empty (0) counts as smallest.
/// Tie-break: TEAMS order (red → blue → green → yellow).
pub(crate) fn smallest_team(players: &[(bool, Option<&str>)]) -> &'static str {
    let counts = team_counts(players);
    let mut best = 0usize;
    for i in 1..TEAMS.len() {
        if counts[i] < counts[best] {
            best = i;
        }
    }
    TEAMS[best]
}

/// Numeric-aware player-id order (numeric ids by value; else lexicographic).
fn cmp_player_id(a: &str, b: &str) -> std::cmp::Ordering {
    match (a.parse::<u128>(), b.parse::<u128>()) {
        (Ok(na), Ok(nb)) => na.cmp(&nb),
        _ => a.cmp(b),
    }
}

/// Plan target team per connected player for a balanced lobby.
///
/// - Only connected players
/// - Sorted by player id (numeric when possible)
/// - Fills TEAMS in order with as-even sizes as possible
/// - Returns only **changed** (player_id, new_team) pairs — idempotent when already balanced
///   under this deterministic assignment.
pub(crate) fn plan_balance(players: &[(String, bool, Option<String>)]) -> Vec<(String, String)> {
    let mut connected: Vec<(String, Option<String>)> = players
        .iter()
        .filter(|(_, connected, _)| *connected)
        .map(|(id, _, team)| (id.clone(), team.clone()))
        .collect();
    connected.sort_by(|a, b| cmp_player_id(&a.0, &b.0));

    let n = connected.len();
    if n == 0 {
        return Vec::new();
    }

    let base = n / TEAMS.len();
    let rem = n % TEAMS.len();
    // Build target team list: first `base+1` for rem teams, then `base` for the rest.
    let mut targets: Vec<&'static str> = Vec::with_capacity(n);
    for (i, team) in TEAMS.iter().enumerate() {
        let count = base + if i < rem { 1 } else { 0 };
        for _ in 0..count {
            targets.push(*team);
        }
    }

    let mut changes = Vec::new();
    for (i, (id, current)) in connected.into_iter().enumerate() {
        let want = targets[i];
        let same = current.as_deref() == Some(want);
        if !same {
            changes.push((id, want.to_string()));
        }
    }
    changes
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::BALANCE_TEAMS, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        warn!("manager control denied: event=balanceTeams check=require_user");
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                let Some(game_id) = payload
                    .get("gameId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                else {
                    warn!("manager control denied: event=balanceTeams check=missing_gameId");
                    return;
                };

                let game_opt = {
                    let registry = ctx.registry.read().await;
                    registry.get_game_by_id(&game_id)
                };

                let Some(game_ref) = game_opt else {
                    warn!(
                        "manager control denied: event=balanceTeams gameId={} check=game_not_found",
                        game_id
                    );
                    return;
                };

                {
                    let game = game_ref.lock().unwrap();
                    if !is_game_host(&game, &payload, &ctx.client_id, Some(&user)) {
                        warn!(
                            "manager control denied: event=balanceTeams gameId={} check=is_game_host",
                            game_id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if game.manager_socket_id != socket.id.to_string() {
                        warn!(
                            "manager control denied: event=balanceTeams gameId={} check=manager_socket_mismatch expected={} got={}",
                            game_id, game.manager_socket_id, socket.id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if game.engine.phase != GamePhase::ShowRoom {
                        warn!(
                            "manager control denied: event=balanceTeams gameId={} check=phase_not_show_room phase={:?}",
                            game_id, game.engine.phase
                        );
                        return;
                    }
                    if !game.selected_modes.team_mode.unwrap_or(false) {
                        warn!(
                            "manager control denied: event=balanceTeams gameId={} check=team_mode_off",
                            game_id
                        );
                        return;
                    }
                }

                let (changes, manager_socket_id, leaderboard) = {
                    let mut game = game_ref.lock().unwrap();
                    let snapshot: Vec<(String, bool, Option<String>)> = game
                        .players
                        .iter()
                        .map(|p| (p.id.clone(), p.connected, p.team_id.clone()))
                        .collect();
                    let changes = plan_balance(&snapshot);
                    for (player_id, new_team) in &changes {
                        if let Some(pos) = game.players.iter().position(|p| p.id == *player_id) {
                            game.players[pos].team_id = Some(new_team.clone());
                            if pos < game.engine.players.len()
                                && game.engine.players[pos].id == *player_id
                            {
                                game.engine.players[pos].team_id = Some(new_team.clone());
                            }
                        }
                    }
                    let manager_socket_id = game.manager_socket_id.clone();
                    let leaderboard = game.players.clone();
                    (changes, manager_socket_id, leaderboard)
                };

                // Broadcast each changed player to manager (NEW_PLAYER upsert) + full roster.
                if let Ok(sid) = manager_socket_id.parse() {
                    if let Some(mgr) = ctx.io.get_socket(sid) {
                        for player in &leaderboard {
                            if changes.iter().any(|(id, _)| id == &player.id) {
                                mgr.emit(constants::manager::NEW_PLAYER, player).ok();
                            }
                        }
                    }
                }

                ctx.io
                    .to(game_id.clone())
                    .emit(
                        constants::player::UPDATE_LEADERBOARD,
                        &razzoozle_protocol::player::PlayerUpdateLeaderboard {
                            leaderboard: leaderboard.clone(),
                        },
                    )
                    .ok();
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap<'a>(rows: &'a [(&str, bool, Option<&'a str>)]) -> Vec<(bool, Option<&'a str>)> {
        rows.iter().map(|(_, c, t)| (*c, *t)).collect()
    }

    fn plan_rows(rows: &[(&str, bool, Option<&str>)]) -> Vec<(String, String)> {
        let owned: Vec<(String, bool, Option<String>)> = rows
            .iter()
            .map(|(id, c, t)| (id.to_string(), *c, t.map(|s| s.to_string())))
            .collect();
        plan_balance(&owned)
    }

    // ── smallest_team ──────────────────────────────────────────────────────

    #[test]
    fn smallest_team_all_empty_picks_red() {
        let players = snap(&[("1", true, None), ("2", true, None)]);
        assert_eq!(smallest_team(&players), "red");
    }

    #[test]
    fn smallest_team_picks_min_count() {
        // red=2, blue=1, green=0 → green
        let players = snap(&[
            ("1", true, Some("red")),
            ("2", true, Some("red")),
            ("3", true, Some("blue")),
        ]);
        assert_eq!(smallest_team(&players), "green");
    }

    #[test]
    fn smallest_team_tie_break_teams_order() {
        // red=1, blue=1, green=1, yellow=1 → red (first among equal)
        let players = snap(&[
            ("1", true, Some("red")),
            ("2", true, Some("blue")),
            ("3", true, Some("green")),
            ("4", true, Some("yellow")),
        ]);
        assert_eq!(smallest_team(&players), "red");
    }

    #[test]
    fn smallest_team_ignores_disconnected() {
        // red has 1 connected + 5 disconnected; blue has 0 connected → blue
        let players = snap(&[
            ("1", true, Some("red")),
            ("2", false, Some("red")),
            ("3", false, Some("red")),
            ("4", true, None),
        ]);
        assert_eq!(smallest_team(&players), "blue");
    }

    // ── plan_balance ───────────────────────────────────────────────────────

    #[test]
    fn balance_assigns_unassigned_evenly() {
        let changes = plan_rows(&[
            ("10", true, None),
            ("20", true, None),
            ("30", true, None),
            ("40", true, None),
        ]);
        // sorted 10,20,30,40 → red,blue,green,yellow (base=1 each)
        assert_eq!(
            changes,
            vec![
                ("10".into(), "red".into()),
                ("20".into(), "blue".into()),
                ("30".into(), "green".into()),
                ("40".into(), "yellow".into()),
            ]
        );
    }

    #[test]
    fn balance_minimal_moves_already_correct() {
        let changes = plan_rows(&[
            ("10", true, Some("red")),
            ("20", true, Some("blue")),
            ("30", true, Some("green")),
            ("40", true, Some("yellow")),
        ]);
        assert!(
            changes.is_empty(),
            "idempotent when already balanced: {:?}",
            changes
        );
    }

    #[test]
    fn balance_phase_input_skips_disconnected() {
        // Only two connected → red + blue; disconnected ignored
        let changes = plan_rows(&[
            ("10", true, None),
            ("20", false, Some("red")),
            ("30", true, None),
        ]);
        assert_eq!(
            changes,
            vec![("10".into(), "red".into()), ("30".into(), "blue".into()),]
        );
    }

    #[test]
    fn balance_idempotent_double_plan() {
        // n=6 → targets red,red,blue,blue,green,yellow for sorted ids 1..6
        // 1→red (same), 2→red (change), 3→blue (change), 4→blue (change),
        // 5→green (change), 6→yellow (change) = 5 changes
        let first = plan_rows(&[
            ("5", true, Some("red")),
            ("1", true, Some("red")),
            ("3", true, Some("red")),
            ("2", true, Some("blue")),
            ("4", true, None),
            ("6", true, None),
        ]);
        assert_eq!(first.len(), 5);
        let mut applied: Vec<(String, bool, Option<String>)> = vec![
            ("5".into(), true, Some("red".into())),
            ("1".into(), true, Some("red".into())),
            ("3".into(), true, Some("red".into())),
            ("2".into(), true, Some("blue".into())),
            ("4".into(), true, None),
            ("6".into(), true, None),
        ];
        for (id, team) in &first {
            if let Some(row) = applied.iter_mut().find(|(i, _, _)| i == id) {
                row.2 = Some(team.clone());
            }
        }
        let second = plan_balance(&applied);
        assert!(
            second.is_empty(),
            "second plan must be empty after apply, got {:?}",
            second
        );
    }

    #[test]
    fn balance_numeric_id_order() {
        // Lexicographic would put "10" before "2"; numeric puts 2 before 10.
        let changes = plan_rows(&[("10", true, None), ("2", true, None)]);
        assert_eq!(
            changes,
            vec![("2".into(), "red".into()), ("10".into(), "blue".into()),]
        );
    }
}
