//! FlowerBattle display projection (WP #928 + #933 wiring).
//!
//! Builds the `ExperiencePayload::FlowerBattle` body that rides the
//! `game:experience` envelope. Content-free: no Question/Answer/solution data.

use crate::state::Game;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::experience::{
    ExperiencePayload, FlowerBattleBackground, FlowerBattlePayload, FlowerBattlePhase,
    FlowerBattleState, FlowerBattleTeamState, FLOWER_BATTLE_RECIPE_VERSION,
};
use razzoozle_protocol::player::Player;
use std::collections::BTreeMap;

/// Build payload from live game state (preferred; L-08/L-10/L-12).
pub fn build_flower_battle_payload_from_game(game: &Game) -> ExperiencePayload {
    ExperiencePayload::FlowerBattle(FlowerBattlePayload {
        state: FlowerBattleState {
            phase: project_phase(game),
            teams: project_team_rosters(&game.players, game),
            // WP #939A: persisted CSPRNG seed (Game::new()), NOT game_id — a
            // real random value that is stable for the session's lifetime and
            // survives snapshot restore (see state/snapshot.rs flowerBattleSeed).
            background: FlowerBattleBackground {
                seed: game.flower_battle_seed.to_string(),
                recipe_version: FLOWER_BATTLE_RECIPE_VERSION,
            },
            // Active open offers from offer cache (values only; sorted for stable wire).
            powerups: {
                let mut offers: Vec<_> = game.flower_battle_offers.values().cloned().collect();
                offers.sort_by(|a, b| a.id.cmp(&b.id));
                offers
            },
        },
    })
}

/// Legacy entry used by tests / callers that only have id + roster.
/// Phase stays Start and team battle fields stay defaults when no Game.
#[cfg(test)]
pub fn build_flower_battle_payload(game_id: &str, players: &[Player]) -> ExperiencePayload {
    ExperiencePayload::FlowerBattle(FlowerBattlePayload {
        state: FlowerBattleState {
            phase: FlowerBattlePhase::Start,
            teams: project_team_rosters_basic(players),
            background: FlowerBattleBackground {
                seed: game_id.to_string(),
                recipe_version: FLOWER_BATTLE_RECIPE_VERSION,
            },
            powerups: vec![],
        },
    })
}

fn project_phase(game: &Game) -> FlowerBattlePhase {
    if game.flower_battle_effects.victory_resolved
        || game.engine.phase == GamePhase::Finished
        || game.flower_battle_winner_team_ids.is_some()
    {
        return FlowerBattlePhase::End;
    }
    if !game.flower_battle_votes.is_empty() {
        return FlowerBattlePhase::Voting;
    }
    match game.engine.phase {
        GamePhase::ShowRoom => FlowerBattlePhase::Start,
        GamePhase::ShowStart => FlowerBattlePhase::Greeting,
        GamePhase::ShowQuestion | GamePhase::SelectAnswer => {
            match game.engine.current_question_index {
                0 => FlowerBattlePhase::Round1,
                1 => FlowerBattlePhase::Round2,
                _ => FlowerBattlePhase::Round3,
            }
        }
        GamePhase::ShowResult | GamePhase::ShowRoundRecap | GamePhase::ShowLeaderboard => {
            FlowerBattlePhase::Results
        }
        GamePhase::Finished => FlowerBattlePhase::End,
    }
}

fn project_team_rosters(players: &[Player], game: &Game) -> Vec<FlowerBattleTeamState> {
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
        .map(|(name, members)| {
            let growth = game.flower_battle_effects.growth_of(&name);
            let effects = game.flower_battle_effects.effects_for(&name).to_vec();
            let shield = if effects.iter().any(|e| e.is_umbrella_shield()) {
                1
            } else {
                0
            };
            let sun = i32::from(*game.flower_battle_sun_points.get(&name).unwrap_or(&0));
            let prev = game
                .flower_battle_previous_attacker
                .get(&name)
                .cloned()
                .flatten();
            FlowerBattleTeamState {
                name,
                members,
                // hp mirrors growth as a 0..10 display meter (not hit-points).
                hp: f32::from(growth),
                shield,
                effects,
                growth_stage: i32::from(growth),
                sun_points: sun,
                previous_attacker_team_id: prev,
            }
        })
        .collect()
}

#[cfg(test)]
fn project_team_rosters_basic(players: &[Player]) -> Vec<FlowerBattleTeamState> {
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
            growth_stage: 0,
            sun_points: 0,
            previous_attacker_team_id: None,
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
            player("p5", Some("  ")),
        ];
        let teams = project_team_rosters_basic(&players);
        assert_eq!(teams.len(), 2);
        assert_eq!(teams[0].name, "blue");
        assert_eq!(teams[0].members, vec!["p2".to_string()]);
        assert_eq!(teams[1].name, "red");
        assert_eq!(teams[1].members, vec!["p1".to_string(), "p3".to_string()]);
        for t in &teams {
            assert_eq!(t.hp, 0.0);
            assert_eq!(t.shield, 0);
            assert!(t.effects.is_empty());
            assert_eq!(t.sun_points, 0);
            assert_eq!(t.growth_stage, 0);
        }
    }

    #[test]
    fn project_team_rosters_keeps_disconnected_and_bot_players() {
        let mut disconnected = player("p1", Some("red"));
        disconnected.connected = false;
        let mut bot = player("p2", Some("red"));
        bot.is_bot = Some(true);
        let teams = project_team_rosters_basic(&[disconnected, bot]);
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

    /// WP #939A — build_flower_battle_payload_from_game (the production path,
    /// unlike the game_id-only legacy test helper above) MUST project the
    /// persisted `Game::flower_battle_seed`, not `game_id`.
    #[test]
    fn build_flower_battle_payload_from_game_uses_persisted_seed() {
        use razzoozle_protocol::quizz::Quizz;

        let mut game = Game::new(
            "game-persisted-seed".to_string(),
            "INVSEED".to_string(),
            "mgr".to_string(),
            "quiz".to_string(),
            Quizz {
                subject: "Seed".to_string(),
                questions: vec![],
                archived: None,
                theme_id: None,
            },
        );
        game.flower_battle_seed = 424_242;

        let payload = build_flower_battle_payload_from_game(&game);
        match payload {
            ExperiencePayload::FlowerBattle(p) => {
                assert_eq!(p.state.background.seed, "424242");
                assert_ne!(
                    p.state.background.seed, game.game_id,
                    "seed must come from the persisted CSPRNG value, not game_id"
                );
            }
            other => panic!("expected FlowerBattle payload, got {other:?}"),
        }
    }

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
            "kind",
            "expiresAfterQuestionId",
            "remainingQuestions",
            "sourceTeamId",
            "growthStage",
            "sunPoints",
            "previousAttackerTeamId",
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
                    effects: vec![
                        FlowerBattleEffect::sunbeam(3),
                        FlowerBattleEffect::acid_rain("blue", 3),
                    ],
                    growth_stage: 3,
                    sun_points: 2,
                    previous_attacker_team_id: Some("blue".into()),
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
