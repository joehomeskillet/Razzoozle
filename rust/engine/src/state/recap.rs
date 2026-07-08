//! WP-N4: Manager recap builder — superlatives from recap_stats/question_stats

use crate::state::{GameState, RecapStat, QuestionStat};
use razzoozle_protocol::results_display::{ManagerRecap, Superlative, SuperlativeKey, HardestQuestion};
use std::collections::HashMap;

impl GameState {
    /// Build manager recap from accumulated recap_stats and question_stats.
    /// Port of Node's game-recap.ts:26-242.
    pub fn build_manager_recap(&self) -> ManagerRecap {
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

        let mut superlatives = Vec::new();

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
        if let Some((_, stat)) = fastest_winner {
            superlatives.push(Superlative {
                key: SuperlativeKey::FastestFinger,
                winner_name: stat.username.clone(),
                winner_avatar: None,
                value: stat.fastest_ms.unwrap_or(0) as f64,
            });
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
            if let Some((_, stat)) = most_correct_winner {
                superlatives.push(Superlative {
                    key: SuperlativeKey::MostCorrect,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: stat.correct as f64,
                });
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
            if let Some((_, stat)) = most_wrong_winner {
                superlatives.push(Superlative {
                    key: SuperlativeKey::MostWrong,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: stat.wrong as f64,
                });
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
            if let Some((_, stat)) = longest_streak_winner {
                superlatives.push(Superlative {
                    key: SuperlativeKey::LongestStreak,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: longest_streak as f64,
                });
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
            if let Some((_, stat)) = biggest_climber_winner {
                superlatives.push(Superlative {
                    key: SuperlativeKey::BiggestClimber,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: biggest_climb as f64,
                });
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
            if let Some((_, stat)) = lucky_guesser_winner {
                superlatives.push(Superlative {
                    key: SuperlativeKey::LuckyGuesser,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: lucky_guesser_count as f64,
                });
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
            if let Some((_, stat)) = most_achievements_winner {
                superlatives.push(Superlative {
                    key: SuperlativeKey::MostAchievements,
                    winner_name: stat.username.clone(),
                    winner_avatar: None,
                    value: most_achievements_count as f64,
                });
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
        if let Some((_, stat, climb)) = comeback_winner {
            superlatives.push(Superlative {
                key: SuperlativeKey::ComebackKid,
                winner_name: stat.username.clone(),
                winner_avatar: None,
                value: climb as f64,
            });
        }

        // hardest_question: min correct% over question_stats (floor: total > 0)
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

        if hardest_question.is_some() {
            superlatives.push(Superlative {
                key: SuperlativeKey::HardestQuestion,
                winner_name: format!("#{}", hardest_question.as_ref().unwrap().question_index + 1),
                winner_avatar: None,
                value: hardest_question.as_ref().unwrap().correct_pct as f64,
            });
        }

        ManagerRecap {
            superlatives,
            hardest_question,
        }
    }
}
