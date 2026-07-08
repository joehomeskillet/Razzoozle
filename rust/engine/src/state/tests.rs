pub use super::*;

#[cfg(test)]
mod tests {
    use super::*;
    use razzoozle_protocol::status::ScoringMode;

    fn fixture_quizz() -> Quizz {
        let json = include_str!("../../../../spikes/golden-frames/fixture-quiz.json");
        serde_json::from_str(json).expect("fixture quiz")
    }

    fn make_player(client_id: &str, username: &str) -> Player {
        Player {
            id: format!("socket-{client_id}"),
            client_id: client_id.to_string(),
            connected: true,
            username: username.to_string(),
            points: 0,
            streak: 0,
            player_token: None,
            is_bot: None,
            avatar: None,
            achievements: None,
            team_id: None,
            identifier_hash: None,
        }
    }

    fn advance_round(
        state: &mut GameState,
        p1_key: i32,
        p2_key: i32,
        p1_time_ms: i64,
        p2_time_ms: i64,
    ) {
        state.open_answers().unwrap();
        state.set_clock_ms(p1_time_ms);
        state.record_answer("player1", Some(p1_key), None, None).unwrap();
        state.set_clock_ms(p2_time_ms);
        state.record_answer("player2", Some(p2_key), None, None).unwrap();
        state.reveal(ScoringMode::Speed).unwrap();
        state.leaderboard_view().unwrap();
    }

    #[test]
    fn full_game_flow_with_fixture_quiz() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(
            quiz,
            vec![make_player("player1", "Alice"), make_player("player2", "Bob")],
        );

        assert_eq!(state.phase, GamePhase::ShowRoom);

        let start = state.start().unwrap();
        assert_eq!(state.phase, GamePhase::ShowStart);
        assert_eq!(start.subject, "Golden Test Quiz");

        let q1 = state.show_question(0).unwrap();
        assert_eq!(state.phase, GamePhase::ShowQuestion);
        assert_eq!(q1.question, "What is 2 + 2?");

        advance_round(&mut state, 1, 0, 100, 200);

        assert_eq!(state.phase, GamePhase::ShowLeaderboard);
        let board = state.sorted_leaderboard();
        assert_eq!(board[0].client_id, "player1");
        assert_eq!(board[1].client_id, "player2");

        let p1_result = state.result_for("player1").unwrap();
        let p2_result = state.result_for("player2").unwrap();
        assert!(p1_result.correct);
        assert!(!p2_result.correct);
        assert!(p1_result.points > p2_result.points);
        assert_eq!(p1_result.streak, 1);
        assert!(p1_result.first_correct);
        assert!(!p2_result.first_correct);

        let phase = state.next_or_finish().unwrap();
        assert_eq!(phase, GamePhase::ShowQuestion);
        assert_eq!(state.current_question_index, 1);
        assert_eq!(state.current_question().question, "What is the capital of France?");

        advance_round(&mut state, 2, 1, 100, 200);

        assert_eq!(state.result_for("player1").unwrap().streak, 2);
        assert_eq!(state.sorted_leaderboard()[0].client_id, "player1");

        // Last round: leaderboard_view() (called inside advance_round) already
        // transitioned straight to FINISHED — no separate next_or_finish() call
        // needed (or possible: phase is no longer ShowLeaderboard).
        assert_eq!(state.phase, GamePhase::Finished);
    }

    #[test]
    fn illegal_transitions_are_rejected() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![make_player("player1", "Alice")]);

        assert!(matches!(
            state.show_question(0),
            Err(GameError::InvalidTransition { .. })
        ));

        state.start().unwrap();
        assert!(matches!(
            state.reveal(ScoringMode::Speed),
            Err(GameError::InvalidTransition { .. })
        ));
    }

    #[test]
    fn start_requires_at_least_one_player() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![]);
        assert!(matches!(state.start(), Err(GameError::NoPlayers)));
    }

    #[test]
    fn duplicate_answer_is_rejected() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![make_player("player1", "Alice")]);
        state.start().unwrap();
        state.show_question(0).unwrap();
        state.open_answers().unwrap();
        state.record_answer("player1", Some(1), None, None).unwrap();
        assert!(matches!(
            state.record_answer("player1", Some(0), None, None),
            Err(GameError::DuplicateAnswer { .. })
        ));
    }

    /// Builds a single-question quiz of the given `question_type` (JSON
    /// `type` string, e.g. "multiple-select" / "type-answer") for the
    /// per-question-type record_answer payload-guard tests below.
    fn quiz_with_question_type(question_type: &str) -> Quizz {
        let json = format!(
            r#"{{"question": "Q?", "type": "{question_type}", "answers": ["a", "b"], "solutions": [0], "cooldown": 1, "time": 10}}"#
        );
        let question: Question = serde_json::from_str(&json).expect("question parses");
        Quizz {
            subject: "Test".to_string(),
            questions: vec![question],
            archived: None,
            theme_id: None,
        }
    }

    fn ready_state(question_type: &str) -> GameState {
        let quiz = quiz_with_question_type(question_type);
        let mut state = GameState::new(quiz, vec![make_player("player1", "Alice")]);
        state.start().unwrap();
        state.show_question(0).unwrap();
        state.open_answers().unwrap();
        state
    }

    #[test]
    fn record_answer_rejects_multi_select_without_array() {
        let mut state = ready_state("multiple-select");
        assert!(matches!(
            state.record_answer("player1", Some(0), None, None),
            Err(GameError::InvalidAnswerShape { .. })
        ));
    }

    #[test]
    fn record_answer_accepts_multi_select_with_array() {
        let mut state = ready_state("multiple-select");
        assert!(state.record_answer("player1", None, Some(vec![0, 1]), None).is_ok());
    }

    #[test]
    fn record_answer_rejects_array_for_non_multi_select() {
        let mut state = ready_state("choice");
        assert!(matches!(
            state.record_answer("player1", None, Some(vec![0]), None),
            Err(GameError::InvalidAnswerShape { .. })
        ));
    }

    #[test]
    fn record_answer_rejects_empty_text_for_type_answer() {
        let mut state = ready_state("type-answer");
        assert!(matches!(
            state.record_answer("player1", None, None, Some("   ".to_string())),
            Err(GameError::InvalidAnswerShape { .. })
        ));
        assert!(matches!(
            state.record_answer("player1", None, None, None),
            Err(GameError::InvalidAnswerShape { .. })
        ));
    }

    #[test]
    fn record_answer_accepts_non_empty_text_for_type_answer() {
        let mut state = ready_state("type-answer");
        assert!(state.record_answer("player1", None, None, Some("Paris".to_string())).is_ok());
    }

    // Race-safety net for R3/R4 (rust/server socket::lifecycle): the server's
    // per-question cooldown-timeout, manager:skipQuestion/revealAnswer, and the
    // all-answered path can all independently decide "reveal now" and race each
    // other. They all funnel into engine.reveal() — this phase guard is what
    // makes AT MOST ONE of them actually score/transition; every other racer's
    // call is a no-op Err, never a double-reveal.
    #[test]
    fn reveal_twice_is_rejected_once_already_revealed() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![make_player("player1", "Alice")]);
        state.start().unwrap();
        state.show_question(0).unwrap();
        state.open_answers().unwrap();
        state.record_answer("player1", Some(1), None, None).unwrap();

        assert!(state.reveal(ScoringMode::Speed).is_ok());
        // A second "reveal now" racing in (e.g. all-answered firing just after a
        // manager:skipQuestion already resolved it) must be rejected, not
        // silently re-score the round.
        assert!(matches!(
            state.reveal(ScoringMode::Speed),
            Err(GameError::InvalidTransition { .. })
        ));
    }

    #[test]
    fn practice_question_skips_first_correct_bonus() {
        let mut quiz = fixture_quizz();
        // Mark the first question as practice
        quiz.questions[0].practice = Some(true);

        let mut state = GameState::new(
            quiz,
            vec![make_player("player1", "Alice"), make_player("player2", "Bob")],
        );

        state.start().unwrap();
        state.show_question(0).unwrap();
        state.open_answers().unwrap();

        // Player 1 answers correctly first, Player 2 answers incorrectly
        state.set_clock_ms(100);
        state.record_answer("player1", Some(1), None, None).unwrap();
        state.set_clock_ms(200);
        state.record_answer("player2", Some(0), None, None).unwrap();

        let results = state.reveal(ScoringMode::Speed).unwrap();

        // Both should have first_correct=false because it's a practice question
        let p1_result = results.iter().find(|r| r.client_id == "player1").unwrap();
        let p2_result = results.iter().find(|r| r.client_id == "player2").unwrap();

        assert!(p1_result.correct);
        assert!(!p2_result.correct);
        // Key assertion: first_correct is false even though player1 got it first
        assert!(!p1_result.first_correct, "practice question should not award first_correct");
        assert!(!p2_result.first_correct);
    }

    #[test]
    fn wp_s_whole_game_fields_persist_and_questions_history_accumulates() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(
            quiz,
            vec![make_player("player1", "Alice"), make_player("player2", "Bob")],
        );

        assert_eq!(state.phase, GamePhase::ShowRoom);

        state.start().unwrap();
        assert_eq!(state.phase, GamePhase::ShowStart);

        // First question
        state.show_question(0).unwrap();
        
        // Insert sentinels into game_counters and recap_stats before first reveal
        state.game_counters.insert("sentinel_counter".into(), GameCounter {
            answered: 99,
            correct: 88,
            ever: true,
        });
        state.recap_stats.insert("sentinel_recap".into(), RecapStat {
            username: "TestUser".to_string(),
            fastest_ms: Some(1000),
            peak_streak: 42,
            correct: 10,
            wrong: 5,
            answered: 15,
            best_climb: 3,
            worst_rank_ever: 5,
            achievement_ids: vec!["ach1".into()],
            lucky_guess: true,
        });

        state.open_answers().unwrap();
        state.set_clock_ms(100);
        state.record_answer("player1", Some(1), None, None).unwrap();
        state.set_clock_ms(200);
        state.record_answer("player2", Some(0), None, None).unwrap();
        state.reveal(ScoringMode::Speed).unwrap();
        state.leaderboard_view().unwrap();

        // Verify questions_history has 1 entry after first round
        assert_eq!(state.questions_history.len(), 1, "questions_history should have 1 entry after first round");

        // Verify sentinels still exist (show_question didn't clear them)
        assert!(state.game_counters.contains_key("sentinel_counter"), 
                "game_counters should persist after show_question");
        assert!(state.recap_stats.contains_key("sentinel_recap"), 
                "recap_stats should persist after show_question");

        // Second question
        let phase = state.next_or_finish().unwrap();
        assert_eq!(phase, GamePhase::ShowQuestion);

        state.open_answers().unwrap();
        state.set_clock_ms(150);
        state.record_answer("player1", Some(2), None, None).unwrap();
        state.set_clock_ms(250);
        state.record_answer("player2", Some(1), None, None).unwrap();
        state.reveal(ScoringMode::Speed).unwrap();

        // Verify questions_history has 2 entries after second round
        assert_eq!(state.questions_history.len(), 2, "questions_history should have 2 entries after second round");

        // Verify sentinels STILL exist (show_question didn't clear them on second call either)
        assert!(state.game_counters.contains_key("sentinel_counter"), 
                "game_counters should persist after second show_question");
        assert_eq!(state.game_counters["sentinel_counter"].answered, 99, 
                   "game_counters sentinel value should not be mutated");
        assert!(state.recap_stats.contains_key("sentinel_recap"), 
                "recap_stats should persist after second show_question");
        assert_eq!(state.recap_stats["sentinel_recap"].peak_streak, 42, 
                   "recap_stats sentinel value should not be mutated");
    }

    #[test]
    fn recap_stats_fold_per_player() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(
            quiz,
            vec![make_player("player1", "Alice"), make_player("player2", "Bob")],
        );

        state.start().unwrap();
        state.show_question(0).unwrap();
        advance_round(&mut state, 1, 0, 150, 250);

        // Verify recap_stats for p1
        let p1_stat = state.recap_stats.get("player1").unwrap();
        assert_eq!(p1_stat.username, "Alice");
        assert_eq!(p1_stat.answered, 1);
        assert_eq!(p1_stat.correct, 1);
        assert_eq!(p1_stat.wrong, 0);

        // Verify recap_stats for p2
        let p2_stat = state.recap_stats.get("player2").unwrap();
        assert_eq!(p2_stat.username, "Bob");
        assert_eq!(p2_stat.answered, 1);
        assert_eq!(p2_stat.correct, 0);
        assert_eq!(p2_stat.wrong, 1);

        // Verify question_stats for question 0
        let q0_stat = state.question_stats.get(&0).unwrap();
        assert_eq!(q0_stat.total, 2);
        assert_eq!(q0_stat.correct, 1);
    }

    #[test]
    fn build_manager_recap_superlatives() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(
            quiz,
            vec![make_player("player1", "Alice"), make_player("player2", "Bob")],
        );

        state.start().unwrap();
        state.show_question(0).unwrap();
        advance_round(&mut state, 1, 0, 100, 300);

        // Build recap
        let recap = state.build_manager_recap();

        // Verify superlatives were generated (should have fastest_finger at minimum)
        assert!(!recap.superlatives.is_empty(), "Should have superlatives after round 1");
    }

    #[test]
    fn wp_n3_default_config_zero_bonus_points() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(quiz, vec![make_player("p1", "Alice")]);
        state.start().unwrap();
        state.show_question(0).unwrap();
        state.open_answers().unwrap();
        state.set_clock_ms(100);
        state.record_answer("p1", Some(1), None, None).unwrap();
        let results = state.reveal(ScoringMode::Speed).unwrap();
        assert_eq!(results[0].bonus_points, 0, "default config has zero bonus");
    }

    #[test]
    fn achievement_ids_enrichment_and_superlatives() {
        let quiz = fixture_quizz();
        let mut state = GameState::new(
            quiz,
            vec![make_player("player1", "Alice"), make_player("player2", "Bob")],
        );

        state.start().unwrap();
        state.show_question(0).unwrap();
        
        // Play the first round: player1 answers correctly (triggers first_correct achievement)
        state.open_answers().unwrap();
        state.set_clock_ms(100);
        state.record_answer("player1", Some(1), None, None).unwrap();
        state.set_clock_ms(200);
        state.record_answer("player2", Some(0), None, None).unwrap();
        let results = state.reveal(ScoringMode::Speed).unwrap();
        
        // Verify that player1 unlocked at least one achievement (first_correct)
        let p1_result = results.iter().find(|r| r.client_id == "player1").unwrap();
        assert!(!p1_result.achievements.is_empty(), "player1 should have unlocked achievements");
        
        // Verify that achievement_ids is populated in recap_stats
        let p1_stat = state.recap_stats.get("player1").unwrap();
        assert!(!p1_stat.achievement_ids.is_empty(), 
                "recap_stats should have achievement_ids populated");
        
        // Verify that MostAchievements superlative is present
        let recap = state.build_manager_recap();
        let has_most_achievements = recap.superlatives.iter()
            .any(|s| s.key == razzoozle_protocol::results_display::SuperlativeKey::MostAchievements);
        assert!(has_most_achievements, 
                "recap should include MostAchievements superlative when achievements are unlocked");
    }
}

