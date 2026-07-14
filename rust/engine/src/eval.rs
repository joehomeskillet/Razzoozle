//! eval.rs — Answer evaluation for all question types.
//! Ported from packages/socket/src/services/game/answer-eval.ts + text-match.ts

use razzoozle_protocol::quizz::{Question, QuestionType};
use unicode_normalization::UnicodeNormalization;

pub const SLIDER_TOLERANCE_FRACTION: f64 = 0.05;

/// Answer submission from client (can be multiple types)
#[derive(Debug, Clone, PartialEq)]
pub struct AnswerInput {
    pub answer_key: Option<i32>,           // for choice, boolean, slider (as i32)
    pub answer_keys: Option<Vec<i32>>,     // for multiple-select
    pub answer_text: Option<String>,       // for type-answer, sentence-builder, wortarten
}

/// Result of evaluating an answer
#[derive(Debug, Clone, PartialEq)]
pub struct EvalResult {
    pub correct: bool,
    pub base: f64, // 0..1, where 1 = fully correct
}

/// Normalize text: trim, lowercase, NFD decompose, then remove combining marks
/// Matches Node.js normalizeText() behavior: "Café" → "cafe"
pub fn normalize_text(s: &str) -> String {
    s.trim()
        .to_lowercase()
        .nfd()
        .collect::<String>()
        .chars()
        .filter(|c| {
            let code = *c as u32;
            !(0x0300..=0x036f).contains(&code)
        })
        .collect()
}

/// Standard Levenshtein edit distance (iterative DP)
fn levenshtein(a: &str, b: &str) -> usize {
    if a == b {
        return 0;
    }
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }

    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0; b.len() + 1];

    for (i, a_char) in a.chars().enumerate() {
        curr[0] = i + 1;
        for (j, b_char) in b.chars().enumerate() {
            let cost = if a_char == b_char { 0 } else { 1 };
            curr[j + 1] = std::cmp::min(
                std::cmp::min(prev[j] + 1, curr[j] + 1),
                prev[j] + cost,
            );
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[b.len()]
}

/// Fuzzy threshold: one allowed edit per 10 chars, floor of 1
fn fuzzy_threshold(s: &str) -> usize {
    std::cmp::max(1, s.len() / 10)
}

/// Match submitted text against accepted answers
fn match_answer(
    submitted: &str,
    accepted_answers: &[String],
    match_mode: &str,
) -> bool {
    let norm = normalize_text(submitted);

    for accepted in accepted_answers {
        match match_mode {
            "exact" => {
                if submitted == accepted {
                    return true;
                }
            }
            "fuzzy" => {
                let norm_accepted = normalize_text(accepted);
                if levenshtein(&norm, &norm_accepted) <= fuzzy_threshold(&norm_accepted) {
                    return true;
                }
            }
            _ => {
                // "normalized" or default
                if norm == normalize_text(accepted) {
                    return true;
                }
            }
        }
    }

    false
}

/// Evaluate a player's answer against a question
pub fn evaluate_answer(question: &Question, answer: &AnswerInput) -> EvalResult {
    let q_type = &question.r#type;

    // Poll: no scoring
    if q_type == &Some(QuestionType::Poll) {
        return EvalResult {
            correct: false,
            base: 0.0,
        };
    }

    // Type-answer: fuzzy text match
    if q_type == &Some(QuestionType::TypeAnswer) {
        if let Some(text) = &answer.answer_text {
            if let Some(accepted) = &question.accepted_answers {
                if !accepted.is_empty() {
                    let match_mode = question.match_mode.as_deref().unwrap_or("normalized");
                    let correct = match_answer(text, accepted, match_mode);
                    return EvalResult {
                        correct,
                        base: if correct { 1.0 } else { 0.0 },
                    };
                }
            }
        }
        return EvalResult {
            correct: false,
            base: 0.0,
        };
    }

    // Slider: proximity scoring within tolerance
    if q_type == &Some(QuestionType::Slider) {
        if let (Some(min), Some(max), Some(correct_val)) =
            (question.min, question.max, question.correct)
        {
            if let Some(answer_val) = answer.answer_key {
                let range = (max - min).abs();
                let range = if range == 0.0 { 1.0 } else { range };
                let dist = (answer_val as f64 - correct_val).abs();
                let accuracy = (1.0 - dist / range).max(0.0);

                let step = question.step.unwrap_or(0.0);
                let tolerance = step.max(range * SLIDER_TOLERANCE_FRACTION);
                let within = dist <= tolerance;

                return EvalResult {
                    correct: within,
                    base: if within { accuracy } else { 0.0 },
                };
            }
        }
        return EvalResult {
            correct: false,
            base: 0.0,
        };
    }

    // Multiple-select: exact set match (order-independent)
    if q_type == &Some(QuestionType::MultipleSelect) {
        if let Some(submitted_ids) = &answer.answer_keys {
            if let Some(solutions) = &question.solutions {
                let mut solutions_sorted = solutions.clone();
                solutions_sorted.sort();
                solutions_sorted.dedup();

                let mut submitted_sorted = submitted_ids.clone();
                submitted_sorted.sort();
                submitted_sorted.dedup();

                let correct = solutions_sorted == submitted_sorted;
                return EvalResult {
                    correct,
                    base: if correct { 1.0 } else { 0.0 },
                };
            }
        }
        return EvalResult {
            correct: false,
            base: 0.0,
        };
    }

    // Sentence-builder: normalized text match against chunks
    if q_type == &Some(QuestionType::SentenceBuilder) {
        if let Some(text) = &answer.answer_text {
            if let Some(chunks) = &question.chunks {
                if !chunks.is_empty() {
                    let correct_sentence = chunks.join(" ");
                    let correct =
                        normalize_text(text) == normalize_text(&correct_sentence);
                    return EvalResult {
                        correct,
                        base: if correct { 1.0 } else { 0.0 },
                    };
                }
            }
        }
        return EvalResult {
            correct: false,
            base: 0.0,
        };
    }

    // Mathematik: numeric answer with tolerance scoring (binary base)
    if q_type == &Some(QuestionType::Mathematik) {
        if let (Some(text), Some(correct_val), Some(tolerance)) = (
            &answer.answer_text,
            question.correct,
            question.tolerance,
        ) {
            // Parse the submitted text as f64, accepting both ',' and '.' as decimal separators
            let normalized = text.replace(',', ".");
            if let Ok(answer_val) = normalized.parse::<f64>() {
                if answer_val.is_finite() && correct_val.is_finite() {
                    let diff = (answer_val - correct_val).abs();
                    let within_tolerance = diff <= tolerance;
                    return EvalResult {
                        correct: within_tolerance,
                        base: if within_tolerance { 1.0 } else { 0.0 },
                    };
                }
            }
        }
        return EvalResult {
            correct: false,
            base: 0.0,
        };
    }

    // Wortarten: per-token POS tagging with partial credit
    // Parse answerText as JSON array of POS strings, compare per-token to solutions
    if q_type == &Some(QuestionType::Wortarten) {
        if let Some(answer_text) = &answer.answer_text {
            if let Some(solutions) = &question.solutions {
                if let Ok(submitted_pos) = serde_json::from_str::<Vec<String>>(answer_text) {
                    // Guard: length mismatch returns base 0
                    if submitted_pos.len() != solutions.len() {
                        return EvalResult {
                            correct: false,
                            base: 0.0,
                        };
                    }

                    // Convert solutions (i32 indices) to string POS tags via pos_set lookup
                    if let Some(pos_set) = &question.pos_set {
                        let correct_pos: Vec<String> = solutions
                            .iter()
                            .filter_map(|&idx| {
                                if idx >= 0 && (idx as usize) < pos_set.len() {
                                    Some(pos_set[idx as usize].clone())
                                } else {
                                    None
                                }
                            })
                            .collect();

                        // Length check after mapping (fail if any index was out of bounds)
                        if correct_pos.len() != solutions.len() {
                            return EvalResult {
                                correct: false,
                                base: 0.0,
                            };
                        }

                        // Disabled token indices are excluded from both numerator and
                        // denominator (they were never presented to the player). Length
                        // guards above stay on the FULL length; only the score sum skips
                        // disabled positions.
                        let disabled: &[i32] = question
                            .disabled_tokens
                            .as_deref()
                            .unwrap_or(&[]);

                        // Count correct tokens among active (non-disabled) positions only
                        let (correct_count, active_count) = submitted_pos
                            .iter()
                            .zip(correct_pos.iter())
                            .enumerate()
                            .filter(|(i, _)| !disabled.contains(&(*i as i32)))
                            .fold((0usize, 0usize), |(correct, active), (_, (s, c))| {
                                (correct + if s == c { 1 } else { 0 }, active + 1)
                            });

                        let base = if active_count == 0 {
                            0.0
                        } else {
                            correct_count as f64 / active_count as f64
                        };
                        let correct = active_count > 0 && base == 1.0;

                        return EvalResult { correct, base };
                    }
                }
            }
        }
        return EvalResult {
            correct: false,
            base: 0.0,
        };
    }
    // Choice / Boolean (default): index-based solutions lookup
    if let Some(answer_key) = answer.answer_key {
        if let Some(solutions) = &question.solutions {
            let correct = solutions.contains(&answer_key);
            return EvalResult {
                correct,
                base: if correct { 1.0 } else { 0.0 },
            };
        }
    }

    EvalResult {
        correct: false,
        base: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_question(q_type: QuestionType) -> Question {
        Question {
            question: "Test?".to_string(),
            r#type: Some(q_type),
            media: None,
            answers: None,
            solutions: None,
            min: None,
            max: None,
            correct: None,
            step: None,
            unit: None,
            chunks: None,
            cooldown: 1,
            time: 10,
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
        disabled_tokens: None,
        }
    }

    #[test]
    fn choice_correct() {
        let mut q = test_question(QuestionType::Choice);
        q.solutions = Some(vec![1]);
        let ans = AnswerInput {
            answer_key: Some(1),
            answer_keys: None,
            answer_text: None,
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn boolean_correct() {
        let mut q = test_question(QuestionType::Boolean);
        q.solutions = Some(vec![1]);
        let ans = AnswerInput {
            answer_key: Some(1),
            answer_keys: None,
            answer_text: None,
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
    }

    #[test]
    fn multiple_select_correct() {
        let mut q = test_question(QuestionType::MultipleSelect);
        q.solutions = Some(vec![0, 2]);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: Some(vec![2, 0]),
            answer_text: None,
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
    }

    #[test]
    fn slider_exact() {
        let mut q = test_question(QuestionType::Slider);
        q.min = Some(0.0);
        q.max = Some(100.0);
        q.correct = Some(50.0);
        q.step = Some(1.0);
        let ans = AnswerInput {
            answer_key: Some(50),
            answer_keys: None,
            answer_text: None,
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn mathematik_exact() {
        let mut q = test_question(QuestionType::Mathematik);
        q.correct = Some(42.0);
        q.tolerance = Some(0.1);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some("42".to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn mathematik_within_tolerance() {
        let mut q = test_question(QuestionType::Mathematik);
        q.correct = Some(42.0);
        q.tolerance = Some(0.5);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some("42.3".to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn mathematik_outside_tolerance() {
        let mut q = test_question(QuestionType::Mathematik);
        q.correct = Some(42.0);
        q.tolerance = Some(0.1);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some("42.5".to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(!result.correct);
        assert_eq!(result.base, 0.0);
    }

    #[test]
    fn mathematik_comma_input() {
        let mut q = test_question(QuestionType::Mathematik);
        q.correct = Some(3.14);
        q.tolerance = Some(0.01);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some("3,14".to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn poll_always_neutral() {
        let q = test_question(QuestionType::Poll);
        let ans = AnswerInput {
            answer_key: Some(0),
            answer_keys: None,
            answer_text: None,
        };
        let result = evaluate_answer(&q, &ans);
        assert!(!result.correct);
        assert_eq!(result.base, 0.0);
    }

    #[test]
    fn type_answer_normalized() {
        let mut q = test_question(QuestionType::TypeAnswer);
        q.accepted_answers = Some(vec!["Paris".to_string()]);
        q.match_mode = Some("normalized".to_string());
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some("  PARIS  ".to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
    }

    #[test]
    fn sentence_builder_correct() {
        let mut q = test_question(QuestionType::SentenceBuilder);
        q.chunks = Some(vec!["The".to_string(), "quick".to_string(), "fox".to_string()]);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some("The quick fox".to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
    }

    #[test]
    fn wortarten_full_correct() {
        let mut q = test_question(QuestionType::Wortarten);
        q.pos_set = Some(vec![
            "Nomen".to_string(),
            "Verb".to_string(),
            "Adjektiv".to_string(),
            "Artikel".to_string(),
        ]);
        q.solutions = Some(vec![3, 0, 2]); // Artikel, Nomen, Adjektiv
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some(r#"["Artikel","Nomen","Adjektiv"]"#.to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn wortarten_partial_correct() {
        let mut q = test_question(QuestionType::Wortarten);
        q.pos_set = Some(vec![
            "Nomen".to_string(),
            "Verb".to_string(),
            "Adjektiv".to_string(),
            "Artikel".to_string(),
        ]);
        q.solutions = Some(vec![3, 0, 2]); // Artikel, Nomen, Adjektiv
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some(r#"["Artikel","Verb","Adjektiv"]"#.to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(!result.correct);
        assert_eq!(result.base, 2.0 / 3.0);
    }

    #[test]
    fn wortarten_length_mismatch() {
        let mut q = test_question(QuestionType::Wortarten);
        q.pos_set = Some(vec![
            "Nomen".to_string(),
            "Verb".to_string(),
            "Adjektiv".to_string(),
        ]);
        q.solutions = Some(vec![0, 1, 2]);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some(r#"["Nomen","Verb"]"#.to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(!result.correct);
        assert_eq!(result.base, 0.0);
    }

    #[test]
    fn wortarten_disabled_token_ignored_in_scoring() {
        // 3 tokens, middle one (index 1) disabled. Submitted answer gets it
        // wrong ("Verb" instead of "Adjektiv") but since it's disabled it must
        // NOT count against the score: 2/2 active correct => base 1.0, correct.
        let mut q = test_question(QuestionType::Wortarten);
        q.pos_set = Some(vec![
            "Nomen".to_string(),
            "Verb".to_string(),
            "Adjektiv".to_string(),
            "Artikel".to_string(),
        ]);
        q.solutions = Some(vec![3, 2, 0]); // Artikel, Adjektiv, Nomen
        q.disabled_tokens = Some(vec![1]);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            // index 1 submitted is deliberately wrong; must be ignored
            answer_text: Some(r#"["Artikel","Verb","Nomen"]"#.to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn wortarten_all_disabled_defensive_zero() {
        // Every token disabled => active_count == 0, base defensively 0.0, not correct.
        let mut q = test_question(QuestionType::Wortarten);
        q.pos_set = Some(vec!["Nomen".to_string(), "Verb".to_string()]);
        q.solutions = Some(vec![0, 1]);
        q.disabled_tokens = Some(vec![0, 1]);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some(r#"["Nomen","Verb"]"#.to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(!result.correct);
        assert_eq!(result.base, 0.0);
    }

    #[test]
    fn wortarten_without_disabled_tokens_matches_legacy_behavior() {
        // Regression guard: missing disabledTokens (None) behaves exactly like
        // the pre-W1 path — full-length scoring, no positions skipped.
        let mut q = test_question(QuestionType::Wortarten);
        q.pos_set = Some(vec![
            "Nomen".to_string(),
            "Verb".to_string(),
            "Adjektiv".to_string(),
            "Artikel".to_string(),
        ]);
        q.solutions = Some(vec![3, 0, 2]); // Artikel, Nomen, Adjektiv
        assert!(q.disabled_tokens.is_none());
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some(r#"["Artikel","Verb","Adjektiv"]"#.to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(!result.correct);
        assert_eq!(result.base, 2.0 / 3.0);
    }

    #[test]
    fn wortarten_out_of_bounds_disabled_index_is_harmless() {
        // disabledTokens containing an OOB index (>= tokens.length) must not
        // panic or affect scoring of the in-bounds positions.
        let mut q = test_question(QuestionType::Wortarten);
        q.pos_set = Some(vec![
            "Nomen".to_string(),
            "Verb".to_string(),
            "Adjektiv".to_string(),
        ]);
        q.solutions = Some(vec![0, 1, 2]);
        q.disabled_tokens = Some(vec![99, -1]);
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some(r#"["Nomen","Verb","Adjektiv"]"#.to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct);
        assert_eq!(result.base, 1.0);
    }

    #[test]
    fn normalize_text_with_composed_accent() {
        // Test that NFD decomposition is applied before filtering combining marks
        // "Café" (é = U+00E9, composed) should become "cafe" after normalization
        assert_eq!(normalize_text("Café"), "cafe");
        assert_eq!(normalize_text("CAFÉ"), "cafe");
        assert_eq!(normalize_text("  Café  "), "cafe");
    }

    #[test]
    fn type_answer_unicode_parity() {
        // Test that "cafe" matches "Café" in normalized mode (matching Node.js behavior)
        let mut q = test_question(QuestionType::TypeAnswer);
        q.accepted_answers = Some(vec!["Café".to_string()]);
        q.match_mode = Some("normalized".to_string());
        let ans = AnswerInput {
            answer_key: None,
            answer_keys: None,
            answer_text: Some("cafe".to_string()),
        };
        let result = evaluate_answer(&q, &ans);
        assert!(result.correct, "cafe should match Café in normalized mode");
    }

    #[test]
    fn histogram_text_normalization() {
        // Test that normalize_text is correctly applied for histogram key collapsing
        // Multiple variations of the same answer should produce the same normalized key
        assert_eq!(normalize_text("London"), "london");
        assert_eq!(normalize_text("LONDON"), "london");
        assert_eq!(normalize_text("LONDON "), "london");
        assert_eq!(normalize_text("  london  "), "london");
        assert_eq!(normalize_text("Lóndon"), "london");  // with accent

        // Empty/whitespace-only strings should become empty
        assert_eq!(normalize_text("   "), "");
        assert_eq!(normalize_text(""), "");
    }
}
