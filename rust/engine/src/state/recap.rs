//! WP-N4: Manager recap builder — superlatives from recap_stats/question_stats
//! WP-H gap 1: per-player recap builder (myRecap + highlight) — the shape
//! Node actually sends to PLAYERS on FINISHED (game-recap.ts's `perPlayer`),
//! distinct from the manager's full superlatives list.

use crate::state::{GameState, RecapStat, QuestionStat};
use razzoozle_protocol::results_display::{
    HardestQuestion, ManagerRecap, MyRecap, PlayerRecap, RecapHighlight, Superlative,
    SuperlativeKey,
};
use std::collections::HashMap;

/// One awarded superlative plus the client_id of the player who won it (empty
/// for hardest_question, which is quiz-level, not player-attributable).
type AwardedSuperlative = (String, Superlative);

impl GameState {
    /// Compute final_ranks (humans-only, sorted by points DESC then username
    /// ASC) + the ordered list of (client_id, Superlative) awards + the
    /// hardest-question detail. Shared by build_manager_recap (which only
    /// needs the Superlative list) and build_player_recap (which additionally
    /// needs the client_id to find each player's own highlight — Node parity:
    /// game-recap.ts's `highlightByClient`, first award won per client wins).
    /// Port of Node's game-recap.ts:26-242.
    fn compute_recap_parts(&self) -> (HashMap<String, i32>, Vec<AwardedSuperlative>, Option<HardestQuestion>) {
        // Compute final_ranks: humans-only, sorted by points DESC then username ASC
        let mut humans = self.players
            .iter()
            .filter(|p| p.is_bot != Some(true))
            .collect::<Vec<_>>();
        humans.sort_by(|a, b| {
            b.points.cmp(&a.points)
                .then_with(|| a.username.cmp(&b.username))
        });
        let final_ranks: HashMap<String, i32> = humans
            .iter()
            .enumerate()
            .map(|(idx, p)| (p.client_id.clone(), (idx + 1) as i32))
            .collect();

        let mut awards: Vec<AwardedSuperlative> = Vec::new();

        // fastest_finger: min fastest_ms (must have answered)
        let mut fastest_winner: Option<(&String, &RecapStat)> = None;
        let mut fastest_time = i64::MAX;
        for (cid, stat) in self.recap_stats.iter() {
            if let Some(ms) = stat.fastest_ms {
                if ms < fastest_time {
                    fastest_time = ms;
                    fastest_winner = Some((cid, stat));
                }
            }
        }
        if let Some((cid, stat)) = fastest_winner {
            awards.push((cid.clone(), Superlative {
                key: SuperlativeKey::FastestFinger,
                winner_name: stat.username.clone(),
                winner_avatar: None,
                value: stat.fastest_ms.unwrap_or(0) as f64,
            }));
        }

        // most_correct: max correct (floor > 0)
        let mut most_correct_winner: Option<(&String, &RecapStat)> = None;
        let mut most_correct_count = 0;
        for (cid, stat) in self.recap_stats.iter() {
            if stat.correct > most_correct_count {
                most_correct_count = stat.correct;
                most_correct_winner = Some((cid, stat));
            }
        }
        if most_correct_count > 0 {
            if let Some((cid, stat)) = most_correct_winner {
                awards.push((cid.clone(), Superlative {
                    key: SuperlativeKey::MostCorrect,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: stat.correct as f64,
                }));
            }
        }

        // most_wrong: max wrong (floor > 0)
        let mut most_wrong_winner: Option<(&String, &RecapStat)> = None;
        let mut most_wrong_count = 0;
        for (cid, stat) in self.recap_stats.iter() {
            if stat.wrong > most_wrong_count {
                most_wrong_count = stat.wrong;
                most_wrong_winner = Some((cid, stat));
            }
        }
        if most_wrong_count > 0 {
            if let Some((cid, stat)) = most_wrong_winner {
                awards.push((cid.clone(), Superlative {
                    key: SuperlativeKey::MostWrong,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: stat.wrong as f64,
                }));
            }
        }

        // longest_streak: max peak_streak (floor > 0)
        let mut longest_streak_winner: Option<(&String, &RecapStat)> = None;
        let mut longest_streak = 0;
        for (cid, stat) in self.recap_stats.iter() {
            if stat.peak_streak > longest_streak {
                longest_streak = stat.peak_streak;
                longest_streak_winner = Some((cid, stat));
            }
        }
        if longest_streak > 0 {
            if let Some((cid, stat)) = longest_streak_winner {
                awards.push((cid.clone(), Superlative {
                    key: SuperlativeKey::LongestStreak,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: longest_streak as f64,
                }));
            }
        }

        // biggest_climber: max best_climb (floor > 0)
        let mut biggest_climber_winner: Option<(&String, &RecapStat)> = None;
        let mut biggest_climb = 0;
        for (cid, stat) in self.recap_stats.iter() {
            if stat.best_climb > biggest_climb {
                biggest_climb = stat.best_climb;
                biggest_climber_winner = Some((cid, stat));
            }
        }
        if biggest_climb > 0 {
            if let Some((cid, stat)) = biggest_climber_winner {
                awards.push((cid.clone(), Superlative {
                    key: SuperlativeKey::BiggestClimber,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: biggest_climb as f64,
                }));
            }
        }

        // lucky_guesser: max correct where lucky_guess is true (floor > 0)
        let mut lucky_guesser_winner: Option<(&String, &RecapStat)> = None;
        let mut lucky_guesser_count = 0;
        for (cid, stat) in self.recap_stats.iter() {
            if stat.lucky_guess && stat.correct > lucky_guesser_count {
                lucky_guesser_count = stat.correct;
                lucky_guesser_winner = Some((cid, stat));
            }
        }
        if lucky_guesser_count > 0 {
            if let Some((cid, stat)) = lucky_guesser_winner {
                awards.push((cid.clone(), Superlative {
                    key: SuperlativeKey::LuckyGuesser,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: lucky_guesser_count as f64,
                }));
            }
        }

        // most_achievements: max achievement_ids.len() (floor > 0)
        let mut most_achievements_winner: Option<(&String, &RecapStat)> = None;
        let mut most_achievements_count = 0;
        for (cid, stat) in self.recap_stats.iter() {
            if stat.achievement_ids.len() > most_achievements_count {
                most_achievements_count = stat.achievement_ids.len();
                most_achievements_winner = Some((cid, stat));
            }
        }
        if most_achievements_count > 0 {
            if let Some((cid, stat)) = most_achievements_winner {
                awards.push((cid.clone(), Superlative {
                    key: SuperlativeKey::MostAchievements,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: most_achievements_count as f64,
                }));
            }
        }

        // comeback_kid: argmax of (worst_rank_ever - final_rank), humans-only (floor > 0)
        let mut comeback_winner: Option<(&String, &RecapStat, i32)> = None;
        let mut best_comeback = 0;
        for (cid, stat) in self.recap_stats.iter() {
            if let Some(final_rank) = final_ranks.get(cid) {
                let climb = stat.worst_rank_ever - final_rank;
                if climb > 0 && climb > best_comeback {
                    best_comeback = climb;
                    comeback_winner = Some((cid, stat, climb));
                }
            }
        }
        if let Some((cid, stat, climb)) = comeback_winner {
            awards.push((cid.clone(), Superlative {
                key: SuperlativeKey::ComebackKid,
                winner_name: stat.username.clone(),
                winner_avatar: None,
                value: climb as f64,
            }));
        }

        // hardest_question: min correct% over question_stats (floor: total > 0)
        // Quiz-level, not player-attributable — tagged with an empty client_id
        // so it never becomes anyone's `highlight`.
        let mut hardest: Option<(i32, i32)> = None; // (index, correct_pct)
        for (idx, q) in self.question_stats.iter() {
            if q.total > 0 {
                let pct = (q.correct as f64 / q.total as f64 * 100.0).round() as i32;
                if hardest.is_none() || pct < hardest.as_ref().unwrap().1 {
                    hardest = Some((*idx, pct));
                }
            }
        }

        let hardest_question = hardest.map(|(idx, pct)| HardestQuestion {
            question_index: idx,
            correct_pct: pct as f64,
        });

        if let Some(hq) = &hardest_question {
            awards.push((String::new(), Superlative {
                key: SuperlativeKey::HardestQuestion,
                winner_name: format!("#{}", hq.question_index + 1),
                winner_avatar: None,
                value: hq.correct_pct,
            }));
        }

        (final_ranks, awards, hardest_question)
    }

    /// Build manager recap from accumulated recap_stats and question_stats.
    /// Port of Node's game-recap.ts:26-242.
    pub fn build_manager_recap(&self) -> ManagerRecap {
        let (_final_ranks, awards, hardest_question) = self.compute_recap_parts();
        ManagerRecap {
            superlatives: awards.into_iter().map(|(_, s)| s).collect(),
            hardest_question,
        }
    }

    /// Build ONE player's own end-of-game recap card (WP-H gap 1): their
    /// accumulated stats (myRecap) plus the single superlative they won, if
    /// any (highlight — the FIRST award in priority order, matching Node's
    /// `highlightByClient`). Returns `None` when the client never had a
    /// recap_stats entry (never played a scored round) — Node parity:
    /// game-recap.ts's `ctx.recapStats.has(player.clientId) ? ... : undefined`.
    pub fn build_player_recap(&self, client_id: &str) -> Option<PlayerRecap> {
        let stat = self.recap_stats.get(client_id)?;
        let (final_ranks, awards, _hardest_question) = self.compute_recap_parts();

        // First award (in priority/push order) this client_id won becomes
        // their phone highlight — hardest_question is tagged with an empty
        // client_id above and can never match here.
        let highlight = awards.iter().find(|(cid, _)| cid == client_id).map(|(_, s)| {
            RecapHighlight { key: s.key.clone(), value: s.value }
        });

        let accuracy_pct = if stat.answered > 0 {
            (stat.correct as f64 / stat.answered as f64 * 100.0).round() as i32
        } else {
            0
        };

        Some(PlayerRecap {
            my_recap: MyRecap {
                rank: final_ranks.get(client_id).copied().unwrap_or(0),
                accuracy_pct,
                correct: stat.correct,
                wrong: stat.wrong,
                fastest_ms: stat.fastest_ms,
                peak_streak: stat.peak_streak,
                achievements: stat.achievement_ids.clone(),
            },
            highlight,
        })
    }
}
