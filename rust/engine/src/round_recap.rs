use razzoozle_protocol::status::{RoundRecapAward, RoundRecapKey};
use std::collections::{HashMap, HashSet};

/// Per-round recap award row: minimal data needed to compute awards
#[derive(Debug, Clone)]
pub struct RoundRecapRow {
    pub client_id: String,
    pub username: String,
    pub avatar: Option<String>,
    pub is_bot: bool,
    pub correct: bool,
    pub response_time_ms: Option<i64>,
    pub streak_after: i32,
    pub last_points: i32,
    pub answered: bool,
}

/// Compute up to 3 game-wide award highlights from per-player data.
/// Bots are excluded; awards follow priority list.
/// Returns empty vec when nothing qualifies (old clients are unaffected).
pub fn compute_round_recap(
    rows: &[RoundRecapRow],
    rank_after_by_client: &HashMap<String, i32>,
    rank_before: &HashMap<String, i32>,
    first_correct_id: Option<&str>,
    has_prior_round: bool,
) -> Vec<RoundRecapAward> {
    let eligible: Vec<_> = rows.iter().filter(|r| !r.is_bot).collect();
    if eligible.is_empty() {
        return vec![];
    }

    let mut awards = vec![];
    let mut used = HashSet::new();

    // 1. fastest_finger — correct answerer, smallest response time
    {
        let mut candidates: Vec<_> = eligible
            .iter()
            .filter(|r| r.correct && r.response_time_ms.is_some())
            .map(|r| (r, r.response_time_ms.unwrap()))
            .collect();
        candidates.sort_by_key(|(_, ms)| *ms);

        if let Some((row, ms)) = candidates
            .iter()
            .find(|(r, _)| !used.contains(&r.username))
            .or_else(|| candidates.first())
        {
            awards.push(RoundRecapAward {
                key: RoundRecapKey::FastestFinger,
                winner_name: row.username.clone(),
                winner_avatar: row.avatar.clone(),
                value: Some(*ms as i32),
            });
            used.insert(row.username.clone());
        }
    }

    // 2. first_correct
    if awards.len() < 3 {
        if let Some(fid) = first_correct_id {
            if let Some(row) = eligible.iter().find(|r| r.client_id == fid) {
                if !used.contains(&row.username) {
                    awards.push(RoundRecapAward {
                        key: RoundRecapKey::FirstCorrect,
                        winner_name: row.username.clone(),
                        winner_avatar: row.avatar.clone(),
                        value: None,
                    });
                    used.insert(row.username.clone());
                }
            }
        }
    }

    // 3. streak — highest >= 2
    if awards.len() < 3 {
        let mut candidates: Vec<_> = eligible
            .iter()
            .filter(|r| r.streak_after >= 2)
            .map(|r| (r, r.streak_after as i64))
            .collect();
        candidates.sort_by(|a, b| b.1.cmp(&a.1)); // desc

        if let Some((row, streak)) = candidates
            .iter()
            .find(|(r, _)| !used.contains(&r.username))
            .or_else(|| candidates.first())
        {
            awards.push(RoundRecapAward {
                key: RoundRecapKey::Streak,
                winner_name: row.username.clone(),
                winner_avatar: row.avatar.clone(),
                value: Some(*streak as i32),
            });
            used.insert(row.username.clone());
        }
    }

    // 4. highest_round_score
    if awards.len() < 3 {
        let mut candidates: Vec<_> = eligible
            .iter()
            .filter(|r| r.last_points > 0)
            .map(|r| (r, r.last_points as i64))
            .collect();
        candidates.sort_by(|a, b| b.1.cmp(&a.1)); // desc

        if let Some((row, points)) = candidates
            .iter()
            .find(|(r, _)| !used.contains(&r.username))
            .or_else(|| candidates.first())
        {
            awards.push(RoundRecapAward {
                key: RoundRecapKey::HighestRoundScore,
                winner_name: row.username.clone(),
                winner_avatar: row.avatar.clone(),
                value: Some(*points as i32),
            });
            used.insert(row.username.clone());
        }
    }

    // 5. rank_climber
    if awards.len() < 3 && has_prior_round {
        let mut candidates: Vec<_> = eligible
            .iter()
            .filter_map(|r| {
                let before = rank_before.get(&r.client_id)?;
                let after = rank_after_by_client.get(&r.client_id)?;
                let climbed = before - after;
                if climbed > 0 {
                    Some((r, climbed as i64))
                } else {
                    None
                }
            })
            .collect();
        candidates.sort_by(|a, b| b.1.cmp(&a.1)); // desc

        if let Some((row, climbed)) = candidates
            .iter()
            .find(|(r, _)| !used.contains(&r.username))
            .or_else(|| candidates.first())
        {
            awards.push(RoundRecapAward {
                key: RoundRecapKey::RankClimber,
                winner_name: row.username.clone(),
                winner_avatar: row.avatar.clone(),
                value: Some(*climbed as i32),
            });
            used.insert(row.username.clone());
        }
    }

    // 6. slowest_player
    if awards.len() < 3 {
        let mut candidates: Vec<_> = eligible
            .iter()
            .filter(|r| r.answered && r.response_time_ms.is_some())
            .map(|r| (r, r.response_time_ms.unwrap()))
            .collect();
        candidates.sort_by(|a, b| b.1.cmp(&a.1)); // desc

        if let Some((row, ms)) = candidates
            .iter()
            .find(|(r, _)| !used.contains(&r.username))
            .or_else(|| candidates.first())
        {
            awards.push(RoundRecapAward {
                key: RoundRecapKey::SlowestPlayer,
                winner_name: row.username.clone(),
                winner_avatar: row.avatar.clone(),
                value: Some(*ms as i32),
            });
            used.insert(row.username.clone());
        }
    }

    // 7. most_wrong
    if awards.len() < 3 {
        if let Some(row) = eligible
            .iter()
            .find(|r| r.answered && !r.correct)
            .and_then(|first| {
                // Find unused, or just use first
                if !used.contains(&first.username) {
                    Some(*first)
                } else {
                    eligible
                        .iter()
                        .find(|r| r.answered && !r.correct)
                        .copied()
                }
            })
        {
            awards.push(RoundRecapAward {
                key: RoundRecapKey::MostWrong,
                winner_name: row.username.clone(),
                winner_avatar: row.avatar.clone(),
                value: Some(1),
            });
        }
    }

    awards
}
