//! Experience-mode start gates (E-11rev soft-start + E-12rev unscored filter).
//! Pure helpers — unit-tested without socket I/O.

use razzoozle_protocol::game::{EndScreen, ExperienceMode, SelectedModes, TeamAssignment};
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Question;
use razzoozle_protocol::status::ScoringMode;

/// Soft/hard outcomes for experience start preconditions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartGateResult {
    /// Preconditions satisfied (or not applicable).
    Ok,
    /// Soft warning — manager must re-emit START_GAME with `confirmed: true`.
    SoftWarning { reason: &'static str },
    /// Hard block — cannot start.
    HardBlock { reason: &'static str },
}

/// Count connected players (bots count if connected — host may start with bots).
pub fn connected_player_count(players: &[Player]) -> usize {
    players.iter().filter(|p| p.connected).count()
}

/// Count distinct non-empty team ids among connected, non-bot players with a team set.
/// Compatible with later auto-assignment (#952): empty/unassigned slots do not count as teams.
pub fn non_empty_team_count(players: &[Player]) -> usize {
    let mut seen = std::collections::BTreeSet::new();
    for p in players {
        if !p.connected || p.is_bot == Some(true) {
            continue;
        }
        if let Some(ref tid) = p.team_id {
            let t = tid.trim();
            if !t.is_empty() {
                seen.insert(t.to_string());
            }
        }
    }
    seen.len()
}

/// E-11rev: soft/hard start gate for experience modes.
///
/// - 0 connected players → always hard block
/// - DeepSeaEscape → hard ≥1 connected (covered by the universal 0-player rule)
/// - PyramidClimb / FlowerBattle without team_mode or with <2 non-empty teams → soft warning
/// - `confirmed` / override skips the soft warning
pub fn evaluate_experience_start_gate(
    experience_mode: Option<ExperienceMode>,
    team_mode: bool,
    players: &[Player],
    confirmed: bool,
) -> StartGateResult {
    let connected = connected_player_count(players);
    if connected == 0 {
        return StartGateResult::HardBlock {
            reason: "noPlayersConnected",
        };
    }

    match experience_mode {
        Some(ExperienceMode::DeepSeaEscape) => {
            // Hard ≥1 connected already enforced above.
            StartGateResult::Ok
        }
        Some(ExperienceMode::PyramidClimb) | Some(ExperienceMode::FlowerBattle) => {
            let teams = non_empty_team_count(players);
            if team_mode && teams >= 2 {
                StartGateResult::Ok
            } else if confirmed {
                // Soft: host acknowledged incomplete team setup (#952 may auto-assign later).
                StartGateResult::Ok
            } else {
                StartGateResult::SoftWarning {
                    reason: "teamSetupIncomplete",
                }
            }
        }
        Some(ExperienceMode::Classic) | None => StartGateResult::Ok,
    }
}

/// Whether a question is scored for experience play (not unscored type, not practice).
pub fn is_experience_scored_question(q: &Question) -> bool {
    if q.practice == Some(true) {
        return false;
    }
    if let Some(t) = q.r#type.as_ref() {
        if t.is_unscored() {
            return false;
        }
    }
    true
}

/// E-12rev: filter unscored + practice questions for non-classic experience modes.
/// Returns (kept questions, skipped count). No-op when mode is None or Classic.
pub fn filter_experience_questions(
    experience_mode: Option<ExperienceMode>,
    questions: Vec<Question>,
) -> (Vec<Question>, usize) {
    let active = match experience_mode {
        Some(ExperienceMode::Classic) | None => false,
        Some(_) => true,
    };
    if !active {
        return (questions, 0);
    }
    let original = questions.len();
    let kept: Vec<Question> = questions
        .into_iter()
        .filter(is_experience_scored_question)
        .collect();
    let skipped = original.saturating_sub(kept.len());
    (kept, skipped)
}

/// Build the per-game `selected_modes` snapshot from already-VALIDATED mode
/// components (Node parity: the snapshot always reflects the clamped/wirksam
/// values, never the raw client request — see register_create's call site,
/// which used to inline this as an 8-field struct literal and once regressed
/// by hardcoding `experience_mode: None` there; extracted so the call site is
/// a single argument list instead).
pub fn build_selected_modes_snapshot(
    validated_scoring_mode: ScoringMode,
    validated_team_mode: bool,
    validated_klassen: bool,
    validated_end_screen: EndScreen,
    player_cap: Option<i64>,
    validated_experience_mode: Option<ExperienceMode>,
    team_assignment: TeamAssignment,
) -> SelectedModes {
    SelectedModes {
        scoring_mode: Some(if validated_scoring_mode == ScoringMode::Speed {
            "speed".to_string()
        } else {
            "accuracy".to_string()
        }),
        team_mode: Some(validated_team_mode),
        klassen: Some(validated_klassen),
        end_screen: Some(validated_end_screen),
        participant_cap: player_cap,
        experience_mode: validated_experience_mode,
        team_assignment,
    }
}

/// Validate requested experience mode against the CSV allow-list.
/// Unknown / not-enabled modes clamp to None (no error).
pub fn validate_experience_mode(
    requested: Option<ExperienceMode>,
    allowed_csv: &str,
) -> Option<ExperienceMode> {
    let em = requested?;
    let em_str = format!("{:?}", em).to_lowercase();
    // Match case-insensitively so "pyramidClimb" and "pyramidclimb" both work.
    let allowed = allowed_csv
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .any(|t| t == em_str);
    if allowed {
        Some(em)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use razzoozle_protocol::quizz::QuestionType;

    fn player(connected: bool, team: Option<&str>, bot: bool) -> Player {
        Player {
            id: "p".into(),
            client_id: "c".into(),
            connected,
            username: "user".into(),
            points: 0,
            streak: 0,
            player_token: None,
            is_bot: if bot { Some(true) } else { None },
            avatar: None,
            achievements: None,
            team_id: team.map(|s| s.to_string()),
            identifier_hash: None,
        }
    }

    fn q(ty: QuestionType, practice: bool) -> Question {
        Question {
            question: "Q".into(),
            r#type: Some(ty),
            media: None,
            answers: None,
            solutions: None,
            min: None,
            max: None,
            correct: None,
            step: None,
            unit: None,
            chunks: None,
            cooldown: 3,
            time: 20,
            practice: if practice { Some(true) } else { None },
            bonus: None,
            submitted_by: None,
            accepted_answers: None,
            match_mode: None,
            tolerance: None,
            decimals: None,
            sentence: None,
            tokens: None,
            pos_set: None,
            disabled_tokens: None,
            items: None,
            correct_order: None,
            segments: None,
            slots: None,
            left_items: None,
            hotspots: None,
        }
    }

    #[test]
    fn soft_gate_pyramid_team_empty_warns_unless_confirmed() {
        let players = vec![player(true, None, false), player(true, Some("red"), false)];
        // team_mode off → soft warn
        assert_eq!(
            evaluate_experience_start_gate(
                Some(ExperienceMode::PyramidClimb),
                false,
                &players,
                false
            ),
            StartGateResult::SoftWarning {
                reason: "teamSetupIncomplete"
            }
        );
        // confirmed overrides
        assert_eq!(
            evaluate_experience_start_gate(
                Some(ExperienceMode::PyramidClimb),
                false,
                &players,
                true
            ),
            StartGateResult::Ok
        );
        // team_mode on but only 1 non-empty team → soft warn
        assert_eq!(
            evaluate_experience_start_gate(
                Some(ExperienceMode::FlowerBattle),
                true,
                &players,
                false
            ),
            StartGateResult::SoftWarning {
                reason: "teamSetupIncomplete"
            }
        );
        // 2 non-empty teams → ok
        let two_teams = vec![
            player(true, Some("red"), false),
            player(true, Some("blue"), false),
        ];
        assert_eq!(
            evaluate_experience_start_gate(
                Some(ExperienceMode::PyramidClimb),
                true,
                &two_teams,
                false
            ),
            StartGateResult::Ok
        );
    }

    #[test]
    fn soft_gate_deep_sea_zero_players_hard_block() {
        let none: Vec<Player> = vec![];
        assert_eq!(
            evaluate_experience_start_gate(
                Some(ExperienceMode::DeepSeaEscape),
                false,
                &none,
                false
            ),
            StartGateResult::HardBlock {
                reason: "noPlayersConnected"
            }
        );
        // disconnected only
        let offline = vec![player(false, None, false)];
        assert_eq!(
            evaluate_experience_start_gate(
                Some(ExperienceMode::DeepSeaEscape),
                false,
                &offline,
                true
            ),
            StartGateResult::HardBlock {
                reason: "noPlayersConnected"
            }
        );
        // ≥1 connected → ok
        let online = vec![player(true, None, false)];
        assert_eq!(
            evaluate_experience_start_gate(
                Some(ExperienceMode::DeepSeaEscape),
                false,
                &online,
                false
            ),
            StartGateResult::Ok
        );
    }

    #[test]
    fn unscored_filter_counts_skipped() {
        // WP example: 10 questions, 3 filtered (2 unscored types + 1 practice) → 7 kept
        let questions = vec![
            q(QuestionType::Choice, false),
            q(QuestionType::Boolean, false),
            q(QuestionType::Slider, false),
            q(QuestionType::MultipleSelect, false),
            q(QuestionType::TypeAnswer, false),
            q(QuestionType::Mathematik, false),
            q(QuestionType::Sequencing, false),
            q(QuestionType::Poll, false),
            q(QuestionType::WordCloud, false),
            q(QuestionType::Choice, true), // practice
        ];
        let (kept, skipped) =
            filter_experience_questions(Some(ExperienceMode::PyramidClimb), questions);
        assert_eq!(kept.len(), 7);
        assert_eq!(skipped, 3);

        // Classic: no filter
        let questions2 = vec![q(QuestionType::Poll, false), q(QuestionType::Choice, false)];
        let (kept2, skipped2) =
            filter_experience_questions(Some(ExperienceMode::Classic), questions2);
        assert_eq!(kept2.len(), 2);
        assert_eq!(skipped2, 0);

        // None: no filter
        let questions3 = vec![q(QuestionType::Poll, false)];
        let (kept3, skipped3) = filter_experience_questions(None, questions3);
        assert_eq!(kept3.len(), 1);
        assert_eq!(skipped3, 0);
    }

    #[test]
    fn validate_experience_mode_clamps_disallowed() {
        assert_eq!(
            validate_experience_mode(Some(ExperienceMode::PyramidClimb), "classic,pyramidclimb"),
            Some(ExperienceMode::PyramidClimb)
        );
        assert_eq!(
            validate_experience_mode(Some(ExperienceMode::PyramidClimb), "pyramidClimb"),
            Some(ExperienceMode::PyramidClimb)
        );
        assert_eq!(
            validate_experience_mode(Some(ExperienceMode::DeepSeaEscape), "classic"),
            None
        );
        assert_eq!(
            validate_experience_mode(Some(ExperienceMode::Classic), ""),
            None
        );
        assert_eq!(validate_experience_mode(None, "classic"), None);
    }

    /// WP #877 regression guard: register_create once hardcoded
    /// `experience_mode: None` in this snapshot instead of forwarding the
    /// validated mode. This exercises the exact function register_create now
    /// calls, so hardcoding `None` there again fails this test.
    #[test]
    fn build_selected_modes_snapshot_persists_validated_experience_mode() {
        let modes = build_selected_modes_snapshot(
            ScoringMode::Speed,
            true,
            false,
            EndScreen::Full,
            Some(42),
            Some(ExperienceMode::PyramidClimb),
            TeamAssignment::Auto,
        );
        assert_eq!(modes.experience_mode, Some(ExperienceMode::PyramidClimb));
        assert_eq!(modes.scoring_mode, Some("speed".to_string()));
        assert_eq!(modes.team_mode, Some(true));
        assert_eq!(modes.klassen, Some(false));
        assert_eq!(modes.end_screen, Some(EndScreen::Full));
        assert_eq!(modes.participant_cap, Some(42));
        assert_eq!(modes.team_assignment, TeamAssignment::Auto);

        let modes_none = build_selected_modes_snapshot(
            ScoringMode::Accuracy,
            false,
            false,
            EndScreen::Full,
            None,
            None,
            TeamAssignment::SelfAssign,
        );
        assert_eq!(modes_none.experience_mode, None);
        assert_eq!(modes_none.scoring_mode, Some("accuracy".to_string()));
        assert_eq!(modes_none.team_assignment, TeamAssignment::SelfAssign);
    }
}
