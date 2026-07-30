//! WP #928 (WP-FLB-03) — content-free display projection for FlowerBattle.
//!
//! Builds the `ExperiencePayload::FlowerBattle` body that rides the
//! `game:experience` envelope (see `socket::status_emit::broadcast_status`,
//! the single chokepoint that decides WHEN to send it and wire-excludes it
//! from question/answer content — WP #877). This module owns only WHAT goes
//! into the payload once that decision is made.
//!
//! Scope discipline (W0): no gameplay state for FlowerBattle exists anywhere
//! in the server yet (growth/sun-points/round-progression land with #929 and
//! #930, which run in parallel — this module must NOT anticipate their
//! formulas). What CAN be wired truthfully today, from data that already
//! exists independent of that work:
//!   - team rosters, from the same `Player.team_id` grouping used elsewhere
//!     (game_flow::experience::non_empty_team_count) — real, live data.
//!   - a deterministic background seed, using `game_id` itself (the type's
//!     own doc comment calls for "a deterministic garden-background seed" —
//!     game_id already satisfies that; no separate RNG seed store exists).
//!
//! Everything else on `FlowerBattleState`/`FlowerBattleTeamState` is a
//! documented docking point defaulted to a neutral starting value, NOT a
//! computed placeholder pretending to be real.

use razzoozle_protocol::experience::{
    ExperiencePayload, FlowerBattleBackground, FlowerBattlePayload, FlowerBattlePhase,
    FlowerBattleState, FlowerBattleTeamState, FLOWER_BATTLE_RECIPE_VERSION,
};
use razzoozle_protocol::player::Player;
use std::collections::BTreeMap;

/// Build the current content-free FlowerBattle payload.
///
/// Anti-cheat/anti-spoiler by construction: only types from `experience.rs`
/// (WP #927) are touched here — no `Question`/`Answer`/quiz data is even in
/// scope for this function to reach for. See `security_no_forbidden_field_names_in_source`
/// and `security_serialized_keys_match_whitelist` below for the two enforced
/// proofs.
pub fn build_flower_battle_payload(game_id: &str, players: &[Player]) -> ExperiencePayload {
    ExperiencePayload::FlowerBattle(FlowerBattlePayload {
        state: FlowerBattleState {
            // #929 docking point: no round-progression state machine exists
            // yet (Greeting/RoleAssignment/Preparation/RoundN/Voting/Results/
            // End all require gameplay logic this WP doesn't own). Always
            // `Start` until #929 lands and drives real transitions.
            phase: FlowerBattlePhase::Start,
            teams: project_team_rosters(players),
            background: FlowerBattleBackground {
                seed: game_id.to_string(),
                recipe_version: FLOWER_BATTLE_RECIPE_VERSION,
            },
            // #930 docking point: power-up offers aren't generated yet.
            powerups: vec![],
        },
    })
}

/// Group all players by `team_id` into public, battle-safe rosters (name +
/// member ids only — no scores, no answers). Mirrors the grouping semantics
/// of `game_flow::experience::non_empty_team_count` (trimmed, non-empty team
/// ids only) but returns the full roster instead of a count, and — unlike
/// that start-gate helper — does NOT filter out disconnected players or bots:
/// this is a display roster (who's on the team), not a start-eligibility
/// check, so a player who's temporarily offline still keeps their spot.
///
/// `hp`/`shield`/`effects`/`sun_points` (growth stage, sun-points-derived shield,
/// active power-up effects, accumulated sun points) are #929/#930 docking points:
/// defaulted to a neutral starting state (garden not yet grown, no shield, no
/// active effects, zero sun points) — real computation is explicitly out of
/// scope for this WP.
fn project_team_rosters(players: &[Player]) -> Vec<FlowerBattleTeamState> {
    let mut teams: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for p in players {
        if let Some(ref team_id) = p.team_id {
            let trimmed = team_id.trim();
            if !trimmed.is_empty() {
                teams
                    .entry(trimmed.to_string())
                    .or_default()
                    .push(p.id.clone());
            }
        }
    }
    teams
        .into_iter()
        .map(|(name, members)| FlowerBattleTeamState {
            name,
            members,
            hp: 0.0,
            shield: 0,
            effects: vec![],
            sun_points: 0,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use razzoozle_protocol::experience::{FlowerBattleEffect, PowerupOffer};
    use regex::Regex;

    fn player(id: &str, team: Option<&str>) -> Player {
        Player {
            id: id.into(),
            client_id: format!("c-{id}"),
            connected: true,
            username: format!("user-{id}"),
            points: 0,
            streak: 0,
            player_token: None,
            is_bot: None,
            avatar: None,
            achievements: None,
            team_id: team.map(|s| s.to_string()),
            identifier_hash: None,
        }
    }

    #[test]
    fn project_team_rosters_groups_by_team_id_deterministically() {
        let players = vec![
            player("p1", Some("red")),
            player("p2", Some("blue")),
            player("p3", Some("red")),
            player("p4", None),
            player("p5", Some("  ")), // blank after trim → excluded
        ];
        let teams = project_team_rosters(&players);
        assert_eq!(teams.len(), 2);
        // BTreeMap ordering: "blue" < "red" lexicographically.
        assert_eq!(teams[0].name, "blue");
        assert_eq!(teams[0].members, vec!["p2".to_string()]);
        assert_eq!(teams[1].name, "red");
        assert_eq!(teams[1].members, vec!["p1".to_string(), "p3".to_string()]);
        for t in &teams {
            assert_eq!(t.hp, 0.0);
            assert_eq!(t.shield, 0);
            assert!(t.effects.is_empty());
            assert_eq!(t.sun_points, 0);
        }
    }

    #[test]
    fn project_team_rosters_keeps_disconnected_and_bot_players() {
        let mut disconnected = player("p1", Some("red"));
        disconnected.connected = false;
        let mut bot = player("p2", Some("red"));
        bot.is_bot = Some(true);
        let teams = project_team_rosters(&[disconnected, bot]);
        assert_eq!(teams.len(), 1);
        assert_eq!(teams[0].members.len(), 2);
        assert_eq!(teams[0].sun_points, 0);
    }

    #[test]
    fn build_flower_battle_payload_uses_game_id_as_deterministic_seed() {
        let payload = build_flower_battle_payload("game-abc-123", &[]);
        match payload {
            ExperiencePayload::FlowerBattle(p) => {
                assert_eq!(p.state.background.seed, "game-abc-123");
                assert_eq!(
                    p.state.background.recipe_version,
                    FLOWER_BATTLE_RECIPE_VERSION
                );
                assert_eq!(p.state.phase, FlowerBattlePhase::Start);
                assert!(p.state.teams.is_empty());
                assert!(p.state.powerups.is_empty());
            }
            other => panic!("expected FlowerBattle payload, got {other:?}"),
        }
    }

    // ========================================================================
    // WP #928 — mandatory security proofs (anti-cheat: this module must never
    // let question/answer/media/solution content reach the display wire).
    // ========================================================================

    /// SECURITY PROOF 1/2 — static source scan. Regression guard against
    /// someone LATER adding a forbidden field (e.g. `question: q.text`) to
    /// this file's actual code. Scans real Rust syntax (struct-field-init
    /// `word:` and field-access `.word`) via word-boundary regex, with
    /// `//`/`///` comment lines stripped first — so this module's own prose
    /// (which legitimately discusses "question"/"answer" content to explain
    /// what must stay OUT) doesn't false-positive the scan.
    #[test]
    fn security_no_forbidden_field_names_in_source() {
        let source = include_str!("flower_battle_display.rs");
        let code_only: String = source
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        let forbidden =
            Regex::new(r"\b(question|answers?|media|solutions?|correct|explanation)\s*[:.]")
                .unwrap();

        let hits: Vec<&str> = forbidden
            .find_iter(&code_only)
            .map(|m| m.as_str())
            .collect();
        assert!(
            hits.is_empty(),
            "forbidden field-name pattern(s) found in flower_battle_display.rs code (non-comment lines): {hits:?}"
        );
    }

    /// SECURITY PROOF 2/2 — runtime wire-shape whitelist. Recursively walks
    /// EVERY object key in the serialized JSON and asserts it's a member of
    /// an explicit allow-list — stricter than a blacklist: any NEW field
    /// added anywhere on `FlowerBattleState`/`FlowerBattleTeamState`/
    /// `PowerupOffer`/`FlowerBattleBackground` in the future (by #929/#930 or
    /// anyone else) must be a conscious addition to this whitelist, not a
    /// silent pass-through. Constructed with every field populated (not the
    /// W0 empty-teams/empty-powerups default) so ALL nested keys are
    /// actually exercised by the walk, not just the current placeholder shape.
    #[test]
    fn security_serialized_keys_match_whitelist() {
        const ALLOWED_KEYS: &[&str] = &[
            "mode",
            "data",
            "state",
            "phase",
            "teams",
            "name",
            "members",
            "hp",
            "shield",
            "effects",
            "sunPoints",
            "background",
            "seed",
            "recipeVersion",
            "powerups",
            "id",
            "offerType",
            "expiresAt",
        ];

        let payload = ExperiencePayload::FlowerBattle(FlowerBattlePayload {
            state: FlowerBattleState {
                phase: FlowerBattlePhase::Round1,
                teams: vec![FlowerBattleTeamState {
                    name: "red".into(),
                    members: vec!["p1".into(), "p2".into()],
                    hp: 3.0,
                    shield: 1,
                    effects: vec![FlowerBattleEffect::Sunbeam, FlowerBattleEffect::AcidRain],
                    sun_points: 2,
                }],
                background: FlowerBattleBackground {
                    seed: "game-1".into(),
                    recipe_version: FLOWER_BATTLE_RECIPE_VERSION,
                },
                powerups: vec![PowerupOffer {
                    id: "pu-1".into(),
                    offer_type: "sunbeam".into(),
                    expires_at: 1_700_000_000_000,
                }],
            },
        });

        let value = serde_json::to_value(&payload).unwrap();
        let mut found_keys = std::collections::BTreeSet::new();
        collect_object_keys(&value, &mut found_keys);

        let disallowed: Vec<&String> = found_keys
            .iter()
            .filter(|k| !ALLOWED_KEYS.contains(&k.as_str()))
            .collect();
        assert!(
            disallowed.is_empty(),
            "serialized FlowerBattle payload contains key(s) not on the wire whitelist: {disallowed:?} (found: {found_keys:?})"
        );

        // Also prove the current builder's actual (empty-placeholder) output
        // is itself a subset of the same whitelist.
        let built = build_flower_battle_payload("g1", &[]);
        let built_value = serde_json::to_value(&built).unwrap();
        let mut built_keys = std::collections::BTreeSet::new();
        collect_object_keys(&built_value, &mut built_keys);
        for k in &built_keys {
            assert!(
                ALLOWED_KEYS.contains(&k.as_str()),
                "builder output contains non-whitelisted key: {k}"
            );
        }
    }

    /// Recursively collect every JSON object key found anywhere in `value`.
    fn collect_object_keys(
        value: &serde_json::Value,
        out: &mut std::collections::BTreeSet<String>,
    ) {
        match value {
            serde_json::Value::Object(map) => {
                for (k, v) in map {
                    out.insert(k.clone());
                    collect_object_keys(v, out);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    collect_object_keys(item, out);
                }
            }
            _ => {}
        }
    }
}
