//! eval.rs — Answer evaluation for all question types.
//! Ported from packages/socket/src/services/game/answer-eval.ts + text-match.ts

use razzoozle_protocol::quizz::{Question, QuestionType};

pub const SLIDER_TOLERANCE_FRACTION: f64 = 0.05;

/// Answer submission from client (can be multiple types)
#[derive(Debug, Clone, PartialEq)]
pub struct AnswerInput {
    pub answer_key: Option<i32>,           // for choice, boolean, slider (as i32)
    pub answer_keys: Option<Vec<i32>>,     // for multiple-select
    pub answer_text: Option<String>,       // for type-answer, sentence-builder
}

/// Result of evaluating an answer
#[derive(Debug, Clone, PartialEq)]
pub struct EvalResult {
    pub correct: bool,
    pub base: f64, // 0..1, where 1 = fully correct
}

/// Normalize text: trim, lowercase, remove combining marks
fn normalize_text(s: &str) -> String {
    s.trim()
        .to_lowercase()
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
}
