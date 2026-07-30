//! team_vote.rs — Pure team-answer aggregation and majority resolution.

use crate::state::Answer;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::status::TeamStanding;
use std::collections::{HashMap, HashSet};
use std::hash::Hash;

pub const TEAM_IDS: &[&str] = &["rot", "blau", "gruen", "gelb"];

/// Confidence level for team vote resolution (local enum, not wire type).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ConfidenceLevel {
    Low,
    Medium,
    High,
}

/// Count votes and return the strict majority winner (> 50%).
/// On tie or split without majority, `tie_break_order` decides (first match wins).
///
/// **Determinism guarantee**: If a tie occurs but no candidate from `tie_break_order`
/// has any votes in the tie set, returns `None` (unresolved). Callers MUST provide
/// a complete tie-break order that covers all vote possibilities to ensure a result.
pub fn resolve_majority<T: Eq + Hash + Clone>(votes: Vec<T>, tie_break_order: Vec<T>) -> Option<T> {
    if votes.is_empty() {
        return None;
    }

    let mut counts: HashMap<T, usize> = HashMap::new();
    for vote in &votes {
        *counts.entry(vote.clone()).or_insert(0) += 1;
    }

    let total = votes.len();
    let majority_threshold = total / 2;

    for (item, &count) in &counts {
        if count > majority_threshold {
            return Some(item.clone());
        }
    }

    let max_count = counts.values().copied().max().unwrap_or(0);
    let top: HashSet<T> = counts
        .iter()
        .filter(|(_, &count)| count == max_count)
        .map(|(key, _)| key.clone())
        .collect();

    // Tie-break via the provided order: first match in order wins.
    // If no match found, return None (caller must provide complete order).
    tie_break_order
        .into_iter()
        .find(|candidate| top.contains(candidate))
}

/// Group submitted answers by team → answer key → vote count.
/// Only players who submitted an answer with a key are counted.
pub fn tally_team_votes(
    players: &[Player],
    answers: &HashMap<String, Answer>,
) -> HashMap<String, HashMap<i32, usize>> {
    let team_by_client: HashMap<&str, &str> = players
        .iter()
        .filter_map(|p| p.team_id.as_deref().map(|tid| (p.client_id.as_str(), tid)))
        .collect();

    let mut tallies: HashMap<String, HashMap<i32, usize>> = HashMap::new();

    for (client_id, answer) in answers {
        let Some(team_id) = team_by_client.get(client_id.as_str()).copied() else {
            continue;
        };
        let Some(answer_key) = answer.answer_input.answer_key else {
            continue;
        };

        tallies
            .entry(team_id.to_string())
            .or_default()
            .entry(answer_key)
            .and_modify(|c| *c += 1)
            .or_insert(1);
    }

    tallies
}

/// Resolve each team's collective answer via majority vote.
/// Tie-break follows `answer_order` (earliest submission wins).
pub fn resolve_team_answer(
    players: &[Player],
    answers: &HashMap<String, Answer>,
    answer_order: &[String],
) -> HashMap<String, Option<i32>> {
    let tallies = tally_team_votes(players, answers);
    let team_by_client: HashMap<&str, &str> = players
        .iter()
        .filter_map(|p| p.team_id.as_deref().map(|tid| (p.client_id.as_str(), tid)))
        .collect();

    tallies
        .into_iter()
        .map(|(team_id, counts)| {
            let votes: Vec<i32> = counts
                .iter()
                .flat_map(|(key, &count)| std::iter::repeat_n(*key, count))
                .collect();

            let tie_break: Vec<i32> = answer_order
                .iter()
                .filter_map(|client_id| {
                    let tid = team_by_client.get(client_id.as_str())?;
                    if *tid != team_id {
                        return None;
                    }
                    let answer = answers.get(client_id)?;
                    answer.answer_input.answer_key
                })
                .collect();

            let resolved = resolve_majority(votes, tie_break);
            (team_id, resolved)
        })
        .collect()
}

/// Resolve per-team confidence from vote counts; three-way ties favor Medium.
pub fn resolve_team_confidence(
    team_vote_counts: HashMap<String, HashMap<ConfidenceLevel, usize>>,
) -> HashMap<String, Option<ConfidenceLevel>> {
    let tie_break = [
        ConfidenceLevel::Medium,
        ConfidenceLevel::Low,
        ConfidenceLevel::High,
    ];

    team_vote_counts
        .into_iter()
        .map(|(team_id, counts)| {
            let votes: Vec<ConfidenceLevel> = counts
                .iter()
                .flat_map(|(level, &count)| std::iter::repeat_n(*level, count))
                .collect();

            let resolved = resolve_majority(votes, tie_break.to_vec());
            (team_id, resolved)
        })
        .collect()
}

/// Aggregate points and player count per team from the current player list.
pub fn compute_team_standings(players: &[Player]) -> Vec<TeamStanding> {
    let mut points: HashMap<String, i32> = HashMap::new();
    let mut player_count: HashMap<String, i32> = HashMap::new();

    for player in players {
        let Some(ref team_id) = player.team_id else {
            continue;
        };
        *points.entry(team_id.clone()).or_insert(0) += player.points;
        *player_count.entry(team_id.clone()).or_insert(0) += 1;
    }

    let mut standings: Vec<TeamStanding> = points
        .into_iter()
        .map(|(team_id, pts)| TeamStanding {
            team_id: team_id.clone(),
            points: pts,
            player_count: player_count.get(&team_id).copied().unwrap_or(0),
        })
        .collect();

    standings.sort_by(|a, b| a.team_id.cmp(&b.team_id));
    standings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eval::AnswerInput;

    fn player(client_id: &str, team_id: Option<&str>, points: i32) -> Player {
        Player {
            id: client_id.to_string(),
            client_id: client_id.to_string(),
            connected: true,
            username: client_id.to_string(),
            points,
            streak: 0,
            player_token: None,
            is_bot: None,
            avatar: None,
            achievements: None,
            team_id: team_id.map(str::to_string),
            identifier_hash: None,
        }
    }

    fn answer(key: i32) -> Answer {
        Answer {
            answer_input: AnswerInput {
                answer_key: Some(key),
                answer_keys: None,
                answer_text: None,
            },
            response_time_ms: 100,
        }
    }

    #[test]
    fn resolve_majority_clear_winner() {
        let result = resolve_majority(vec![1, 1, 1, 2], vec![2, 1]);
        assert_eq!(result, Some(1));
    }

    #[test]
    fn resolve_majority_two_way_split_uses_tie_break() {
        let result = resolve_majority(vec![1, 2], vec![2, 1]);
        assert_eq!(result, Some(2));
    }

    #[test]
    fn resolve_majority_empty_votes() {
        let result = resolve_majority(Vec::<i32>::new(), vec![1]);
        assert_eq!(result, None);
    }

    #[test]
    fn resolve_majority_three_way_tie_uses_first_tie_break_match() {
        let result = resolve_majority(vec![1, 2, 3], vec![3, 1, 2]);
        assert_eq!(result, Some(3));
    }

    #[test]
    fn resolve_majority_tie_without_tie_break_coverage_returns_none() {
        // 3-way tie (1, 2, 3 each have 1 vote), but tie_break_order only includes [4, 5].
        // None of the top candidates are in the order → deterministic None, not random.
        let result = resolve_majority(vec![1, 2, 3], vec![4, 5]);
        assert_eq!(result, None);
    }

    #[test]
    fn tally_team_votes_groups_by_team_and_key() {
        let players = vec![
            player("a", Some("rot"), 0),
            player("b", Some("rot"), 0),
            player("c", Some("blau"), 0),
            player("d", None, 0),
        ];
        let mut answers = HashMap::new();
        answers.insert("a".to_string(), answer(1));
        answers.insert("b".to_string(), answer(1));
        answers.insert("c".to_string(), answer(2));
        answers.insert("d".to_string(), answer(3));

        let tallies = tally_team_votes(&players, &answers);

        assert_eq!(tallies.get("rot").and_then(|m| m.get(&1)), Some(&2));
        assert_eq!(tallies.get("blau").and_then(|m| m.get(&2)), Some(&1));
        assert!(!tallies.contains_key("gelb"));
    }

    #[test]
    fn resolve_team_answer_majority_and_tie_break() {
        let players = vec![
            player("p1", Some("rot"), 0),
            player("p2", Some("rot"), 0),
            player("p3", Some("rot"), 0),
            player("p4", Some("blau"), 0),
            player("p5", Some("blau"), 0),
        ];
        let mut answers = HashMap::new();
        answers.insert("p1".to_string(), answer(1));
        answers.insert("p2".to_string(), answer(2));
        answers.insert("p3".to_string(), answer(1));
        answers.insert("p4".to_string(), answer(0));
        answers.insert("p5".to_string(), answer(1));

        let order = vec![
            "p2".to_string(),
            "p1".to_string(),
            "p3".to_string(),
            "p4".to_string(),
            "p5".to_string(),
        ];

        let resolved = resolve_team_answer(&players, &answers, &order);

        assert_eq!(resolved.get("rot"), Some(&Some(1)));
        assert_eq!(resolved.get("blau"), Some(&Some(0)));
    }

    #[test]
    fn resolve_team_confidence_three_way_tie_favors_medium() {
        let mut rot_counts = HashMap::new();
        rot_counts.insert(ConfidenceLevel::Low, 1);
        rot_counts.insert(ConfidenceLevel::Medium, 1);
        rot_counts.insert(ConfidenceLevel::High, 1);

        let mut input = HashMap::new();
        input.insert("rot".to_string(), rot_counts);

        let resolved = resolve_team_confidence(input);

        assert_eq!(resolved.get("rot"), Some(&Some(ConfidenceLevel::Medium)));
    }

    #[test]
    fn resolve_team_confidence_clear_majority() {
        let mut blau_counts = HashMap::new();
        blau_counts.insert(ConfidenceLevel::High, 3);
        blau_counts.insert(ConfidenceLevel::Low, 1);

        let mut input = HashMap::new();
        input.insert("blau".to_string(), blau_counts);

        let resolved = resolve_team_confidence(input);

        assert_eq!(resolved.get("blau"), Some(&Some(ConfidenceLevel::High)));
    }

    #[test]
    fn compute_team_standings_aggregates_points_and_count() {
        let players = vec![
            player("a", Some("rot"), 500),
            player("b", Some("rot"), 300),
            player("c", Some("blau"), 700),
            player("d", None, 999),
        ];

        let standings = compute_team_standings(&players);

        assert_eq!(standings.len(), 2);

        let blau = standings.iter().find(|s| s.team_id == "blau").unwrap();
        assert_eq!(blau.points, 700);
        assert_eq!(blau.player_count, 1);

        let rot = standings.iter().find(|s| s.team_id == "rot").unwrap();
        assert_eq!(rot.points, 800);
        assert_eq!(rot.player_count, 2);
    }

    #[test]
    fn compute_team_standings_empty_input_no_panic() {
        let standings = compute_team_standings(&[]);
        assert!(standings.is_empty());
    }

    #[test]
    fn team_ids_const_lists_all_colors() {
        assert_eq!(TEAM_IDS.len(), 4);
        assert!(TEAM_IDS.contains(&"rot"));
        assert!(TEAM_IDS.contains(&"gelb"));
    }
}
