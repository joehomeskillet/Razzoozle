//! scoring.rs — Pure points calculation ported from Node.js (game.ts + round-manager.ts).

use razzoozle_protocol::quizz::Question;
use razzoozle_protocol::status::ScoringMode;

pub const MAX_POINTS: i32 = 1000;
pub const FIRST_CORRECT_BONUS: i32 = 100;
pub const STREAK_STEP: f64 = 0.1;
pub const STREAK_CAP: i32 = 5;

/// Time-decayed base points for an answer received within the question window.
pub fn time_to_point(
    response_time_ms: i64,
    question_time_s: i32,
    mode: ScoringMode,
) -> i32 {
    let seconds = question_time_s.max(1) as f64;
    let elapsed_s = response_time_ms.max(0) as f64 / 1000.0;

    if elapsed_s > seconds {
        return 0;
    }

    let points = match mode {
        ScoringMode::Accuracy => MAX_POINTS as f64,
        ScoringMode::Speed => {
            let decay = (MAX_POINTS as f64 / seconds) * elapsed_s;
            (MAX_POINTS as f64 - decay).max(0.0)
        }
    };

    points.round() as i32
}

/// Whether `answer_key` matches the question's configured solutions.
pub fn is_correct(question: &Question, answer_key: i32) -> bool {
    question
        .solutions
        .as_ref()
        .is_some_and(|solutions| solutions.contains(&answer_key))
}

/// Full round points: base decay × streak × bonus question multiplier.
pub fn calculate_points(
    correct: bool,
    base_factor: f64,
    response_time_ms: i64,
    question_time_s: i32,
    streak_before: i32,
    question: &Question,
    mode: ScoringMode,
) -> i32 {
    if question.practice == Some(true) {
        return 0;
    }

    let base_points = if correct {
        time_to_point(response_time_ms, question_time_s, mode)
    } else {
        0
    };

    let raw_points = base_factor * base_points as f64;

    let streak_mult = if correct {
        1.0 + STREAK_STEP * streak_before.min(STREAK_CAP) as f64
    } else {
        1.0
    };

    let bonus_mult = if question.bonus == Some(true) { 2.0 } else { 1.0 };

    (raw_points * streak_mult * bonus_mult).round() as i32
}

/// Flat first-correct bonus scaled by answer accuracy (`base_factor` in 0..1).
pub fn apply_first_correct_bonus(points: i32, base_factor: f64) -> i32 {
    points + (FIRST_CORRECT_BONUS as f64 * base_factor).round() as i32
}

#[cfg(test)]
mod tests {
    use super::*;
    use razzoozle_protocol::quizz::Question;

    fn choice_question(time: i32) -> Question {
        Question {
            question: "Q".to_string(),
            r#type: None,
            media: None,
            answers: Some(vec!["A".to_string(), "B".to_string()]),
            solutions: Some(vec![1]),
            min: None,
            max: None,
            correct: None,
            step: None,
            unit: None,
            chunks: None,
            cooldown: 1,
            time,
            practice: None,
            bonus: None,
            submitted_by: None,
            accepted_answers: None,
            match_mode: None,
        tolerance: None,
        decimals: None,
        sentence: None,
        tokens: None,
        pos_set: None,
        }
    }

    #[test]
    fn speed_mode_decays_linearly() {
        assert_eq!(time_to_point(0, 20, ScoringMode::Speed), 1000);
        assert_eq!(time_to_point(10_000, 20, ScoringMode::Speed), 500);
        assert_eq!(time_to_point(20_000, 20, ScoringMode::Speed), 0);
        assert_eq!(time_to_point(25_000, 20, ScoringMode::Speed), 0);
    }

    #[test]
    fn accuracy_mode_awards_full_points_within_window() {
        assert_eq!(time_to_point(0, 20, ScoringMode::Accuracy), 1000);
        assert_eq!(time_to_point(15_000, 20, ScoringMode::Accuracy), 1000);
        assert_eq!(time_to_point(21_000, 20, ScoringMode::Accuracy), 0);
    }

    #[test]
    fn fast_correct_beats_slow_correct_in_speed_mode() {
        let q = choice_question(10);
        let fast = calculate_points(true, 1.0, 100, 10, 0, &q, ScoringMode::Speed);
        let slow = calculate_points(true, 1.0, 900, 10, 0, &q, ScoringMode::Speed);
        assert!(fast > slow);
        assert_eq!(fast, 990);
        assert_eq!(slow, 910);
    }

    #[test]
    fn wrong_answer_scores_zero() {
        let q = choice_question(10);
        let points = calculate_points(false, 0.0, 100, 10, 3, &q, ScoringMode::Speed);
        assert_eq!(points, 0);
    }

    #[test]
    fn streak_multiplier_grows_and_caps() {
        let q = choice_question(10);
        let base = calculate_points(true, 1.0, 0, 10, 0, &q, ScoringMode::Speed);
        let streak_2 = calculate_points(true, 1.0, 0, 10, 2, &q, ScoringMode::Speed);
        let streak_capped = calculate_points(true, 1.0, 0, 10, 100, &q, ScoringMode::Speed);

        assert_eq!(base, 1000);
        assert_eq!(streak_2, 1200);
        assert_eq!(streak_capped, 1500);
    }

    #[test]
    fn first_correct_bonus_scales_with_base_factor() {
        assert_eq!(apply_first_correct_bonus(500, 1.0), 600);
        assert_eq!(apply_first_correct_bonus(500, 0.0), 500);
        assert_eq!(apply_first_correct_bonus(500, 0.5), 550);
    }

    #[test]
    fn is_correct_checks_solutions() {
        let q = choice_question(10);
        assert!(is_correct(&q, 1));
        assert!(!is_correct(&q, 0));
    }
}