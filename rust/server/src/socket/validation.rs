//! Question validation mirroring Node's `questionValidator`
//! (`packages/common/src/validators/quizz.ts` superRefine + base schema).
//!
//! Returns `Result<(), &'static str>` where `Err` is an i18n key
//! (`errors:quizz.*`) matching the Node/Zod messages.

use razzoozle_protocol::quizz::{Question, QuestionType};
use serde_json::Value;

/// Validate a question payload against the Node `questionValidator` contract.
///
/// On failure returns the first matching i18n key (e.g. `errors:quizz.questionEmpty`).
pub fn validate_question(q: &Value) -> Result<(), &'static str> {
    // Node transforms `solutions: number` → `[number]` before refine.
    let mut normalized = q.clone();
    if let Some(obj) = normalized.as_object_mut() {
        if let Some(sol) = obj.get("solutions").cloned() {
            if sol.is_number() {
                obj.insert("solutions".to_string(), serde_json::json!([sol]));
            }
        }
    }

    let question: Question =
        serde_json::from_value(normalized).map_err(|_| "errors:quizz.invalidPayload")?;

    // Base: non-empty question text
    if question.question.is_empty() {
        return Err("errors:quizz.questionEmpty");
    }

    // cooldown 3–15, time 5–120 (Zod int ranges; no custom message → invalidPayload)
    if question.cooldown < 3 || question.cooldown > 15 {
        return Err("errors:quizz.invalidPayload");
    }
    if question.time < 5 || question.time > 120 {
        return Err("errors:quizz.invalidPayload");
    }

    // answers (when present): non-empty items, 2–4 length
    if let Some(ref answers) = question.answers {
        for a in answers {
            if a.is_empty() {
                return Err("errors:quizz.answerEmpty");
            }
        }
        if answers.len() < 2 {
            return Err("errors:quizz.tooFewAnswers");
        }
        if answers.len() > 4 {
            return Err("errors:quizz.tooManyAnswers");
        }
    }

    // chunks (when present): non-empty, max 40 chars each, min 2 / max 16 items
    // (Node base schema: z.array(...).min(2).max(16).optional())
    if let Some(ref chunks) = question.chunks {
        for c in chunks {
            if c.is_empty() {
                return Err("errors:quizz.chunkEmpty");
            }
            if c.chars().count() > 40 {
                return Err("errors:quizz.chunkTooLong");
            }
        }
        if chunks.len() < 2 {
            return Err("errors:quizz.tooFewChunks");
        }
        if chunks.len() > 16 {
            return Err("errors:quizz.invalidPayload");
        }
    }

    // acceptedAnswers (when present): non-empty items ≤200 chars, max 20
    if let Some(ref accepted) = question.accepted_answers {
        if accepted.len() > 20 {
            return Err("errors:quizz.invalidPayload");
        }
        for a in accepted {
            if a.is_empty() || a.chars().count() > 200 {
                return Err("errors:quizz.invalidPayload");
            }
        }
    }

    // media URL (Node questionMediaValidator)
    if let Some(ref media) = question.media {
        if !is_valid_media_url(&media.url) {
            return Err("errors:quizz.invalidMediaUrl");
        }
    }

    // Per-type superRefine (mirrors Node)
    match question.r#type.as_ref() {
        Some(QuestionType::Slider) => {
            let (min, max, correct) = match (question.min, question.max, question.correct) {
                (Some(min), Some(max), Some(correct)) => (min, max, correct),
                _ => return Err("errors:quizz.sliderMissing"),
            };
            if min >= max {
                return Err("errors:quizz.sliderRange");
            }
            if correct < min || correct > max {
                return Err("errors:quizz.sliderCorrect");
            }
        }
        Some(QuestionType::Poll) => {
            // Opinion vote: needs answers, no correct solution.
            if question.answers.as_ref().map(|a| a.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewAnswers");
            }
        }
        Some(QuestionType::MultipleSelect) => {
            if question.answers.as_ref().map(|a| a.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewAnswers");
            }
            if question.solutions.as_ref().map(|s| s.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.solutionsMin2");
            }
        }
        Some(QuestionType::TypeAnswer) => {
            if question
                .accepted_answers
                .as_ref()
                .map(|a| a.len())
                .unwrap_or(0)
                < 1
            {
                return Err("errors:quizz.acceptedAnswersMin");
            }
        }
        Some(QuestionType::SentenceBuilder) => {
            // Base already enforces min(2) when chunks is present; still require
            // the field itself (Node superRefine: !q.chunks || length < 2).
            if question.chunks.is_none() {
                return Err("errors:quizz.tooFewChunks");
            }
        }
        Some(QuestionType::Mathematik) => {
            // Mathematik: correct and tolerance required; decimals must be in range
            let correct = match question.correct {
                Some(c) if c.is_finite() => c,
                _ => return Err("errors:quizz.invalidPayload"),
            };

            let tolerance = match question.tolerance {
                Some(t) if t >= 0.0 && t.is_finite() => t,
                _ => return Err("errors:quizz.invalidPayload"),
            };

            let decimals = match question.decimals {
                Some(d) if d >= 0 && d <= 6 => d,
                None => 2, // default is OK
                _ => return Err("errors:quizz.invalidPayload"),
            };

            // Validation passed for these specific fields
            let _ = (correct, tolerance, decimals);
        }
        Some(QuestionType::Wortarten) => {
            // Wortarten: sentence + tokens + solutions + pos_set validation
            if question.sentence.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
                return Err("errors:quizz.sentenceEmpty");
            }
            if let Some(tokens) = &question.tokens {
                if tokens.is_empty() || tokens.len() > 100 {
                    return Err("errors:quizz.invalidPayload");
                }
                for token in tokens {
                    if token.is_empty() {
                        return Err("errors:quizz.invalidPayload");
                    }
                }
                if let Some(solutions) = &question.solutions {
                    if solutions.len() != tokens.len() {
                        return Err("errors:quizz.invalidPayload");
                    }
                }
            } else {
                return Err("errors:quizz.invalidPayload");
            }
            if question.pos_set.as_ref().map(|ps| ps.is_empty()).unwrap_or(true) {
                return Err("errors:quizz.invalidPayload");
            }
        }
        Some(QuestionType::Sequencing) => {
            // Sequencing: reorderable items + correctOrder of item ids.
            // Without this arm, Sequencing fell through to the choice default
            // and rejected every save with tooFewAnswers (blocks fixture upsert
            // and Wave 6 sequencing-live e2e).
            let items = match question.items.as_ref() {
                Some(items) if items.len() >= 2 => items,
                _ => return Err("errors:quizz.invalidPayload"),
            };
            for item in items {
                if item.id.is_empty() || item.label.is_empty() {
                    return Err("errors:quizz.invalidPayload");
                }
            }
            let order = match question.correct_order.as_ref() {
                Some(order) if order.len() == items.len() => order,
                _ => return Err("errors:quizz.invalidPayload"),
            };
            for id in order {
                if !items.iter().any(|it| it.id == *id) {
                    return Err("errors:quizz.invalidPayload");
                }
            }
        }
        Some(QuestionType::FillBlank) => {
            let slots = match question.slots.as_ref() {
                Some(slots) if !slots.is_empty() => slots,
                _ => return Err("errors:quizz.invalidPayload"),
            };
            for s in slots {
                if s.options.len() < 2 {
                    return Err("errors:quizz.invalidPayload");
                }
                if s.correct_index < 0 || (s.correct_index as usize) >= s.options.len() {
                    return Err("errors:quizz.invalidPayload");
                }
            }
            if let Some(segs) = &question.segments {
                if segs.len() != slots.len() + 1 {
                    return Err("errors:quizz.invalidPayload");
                }
            }
        }
        Some(QuestionType::Matching) => {
            let items = match question.left_items.as_ref() {
                Some(items) if !items.is_empty() => items,
                _ => return Err("errors:quizz.invalidPayload"),
            };
            for i in items {
                if i.label.is_empty() || i.options.len() < 2 {
                    return Err("errors:quizz.invalidPayload");
                }
                if i.correct_index < 0 || (i.correct_index as usize) >= i.options.len() {
                    return Err("errors:quizz.invalidPayload");
                }
            }
        }
        Some(QuestionType::DropPin) => {
            if question.media.as_ref().map(|m| m.url.is_empty()).unwrap_or(true) {
                return Err("errors:quizz.invalidPayload");
            }
            let spots = match question.hotspots.as_ref() {
                Some(h) if !h.is_empty() => h,
                _ => return Err("errors:quizz.invalidPayload"),
            };
            for h in spots {
                if h.w <= 0.0 || h.h <= 0.0 || h.x < 0.0 || h.y < 0.0 || h.x + h.w > 1.0 + 1e-9 || h.y + h.h > 1.0 + 1e-9 {
                    return Err("errors:quizz.invalidPayload");
                }
            }
        }
        Some(QuestionType::WordCloud) | Some(QuestionType::Brainstorm) => {
            // Word cloud / brainstorm: unscored collection formats, same shape as poll
            // — need seed answers, no correct solution required.
            if question.answers.as_ref().map(|a| a.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewAnswers");
            }
        }
        Some(QuestionType::Confidence) | Some(QuestionType::MicroLesson) => {
            // Confidence / micro-lesson: unscored, no extra fields required
            // (permissive stub, same pattern as mathematik/wortarten).
        }
        // choice / boolean / None → default
        _ => {
            if question.answers.as_ref().map(|a| a.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewAnswers");
            }
            if question.solutions.as_ref().map(|s| s.len()).unwrap_or(0) < 1 {
                return Err("errors:quizz.noSolution");
            }
        }
    }

    Ok(())
}

/// Absolute http(s) URL or site-relative `/media/` / `/theme/` path (no `..`).
fn is_valid_media_url(url: &str) -> bool {
    if url.is_empty() {
        return false;
    }
    // Node: /^https?:\/\/\S+$/ — at least one non-whitespace char after scheme
    if url.starts_with("https://") {
        let rest = &url[8..];
        return !rest.is_empty() && !rest.chars().any(|c| c.is_whitespace());
    }
    if url.starts_with("http://") {
        let rest = &url[7..];
        return !rest.is_empty() && !rest.chars().any(|c| c.is_whitespace());
    }
    if url.contains("..") {
        return false;
    }
    if let Some(rest) = url.strip_prefix("/media/") {
        return !rest.is_empty() && !rest.chars().any(|c| c.is_whitespace());
    }
    if let Some(rest) = url.strip_prefix("/theme/") {
        return !rest.is_empty() && !rest.chars().any(|c| c.is_whitespace());
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn choice_ok() {
        let q = json!({
            "question": "2+2?",
            "type": "choice",
            "answers": ["3", "4"],
            "solutions": [1],
            "cooldown": 5,
            "time": 20
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn empty_question() {
        let q = json!({
            "question": "",
            "answers": ["a", "b"],
            "solutions": [0],
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.questionEmpty"));
    }

    #[test]
    fn slider_missing() {
        let q = json!({
            "question": "age?",
            "type": "slider",
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.sliderMissing"));
    }

    #[test]
    fn multiple_select_needs_two_solutions() {
        let q = json!({
            "question": "pick two",
            "type": "multiple-select",
            "answers": ["a", "b", "c"],
            "solutions": [0],
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.solutionsMin2"));
    }

    #[test]
    fn type_answer_needs_accepted() {
        let q = json!({
            "question": "capital?",
            "type": "type-answer",
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(
            validate_question(&q),
            Err("errors:quizz.acceptedAnswersMin")
        );
    }

    #[test]
    fn solutions_number_normalized() {
        let q = json!({
            "question": "2+2?",
            "answers": ["3", "4"],
            "solutions": 1,
            "cooldown": 5,
            "time": 20
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn chunks_on_choice_rejected() {
        // Base schema min(2) applies to any type when chunks is present.
        let q = json!({
            "question": "2+2?",
            "type": "choice",
            "answers": ["3", "4"],
            "solutions": [1],
            "chunks": ["one"],
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.tooFewChunks"));
    }

    #[test]
    fn scheme_only_url_rejected() {
        let q = json!({
            "question": "look?",
            "type": "choice",
            "answers": ["a", "b"],
            "solutions": [0],
            "media": { "type": "image", "url": "https://" },
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.invalidMediaUrl"));
    }

    #[test]
    fn valid_http_url_with_path() {
        let q = json!({
            "question": "look?",
            "type": "choice",
            "answers": ["a", "b"],
            "solutions": [0],
            "media": { "type": "image", "url": "http://example.com/img.jpg" },
            "cooldown": 5,
            "time": 20
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn mathematik_valid() {
        let q = json!({
            "question": "What is 2+2?",
            "type": "mathematik",
            "correct": 4.0,
            "tolerance": 0.1,
            "decimals": 2,
            "cooldown": 5,
            "time": 20
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn mathematik_missing_correct() {
        let q = json!({
            "question": "What is 2+2?",
            "type": "mathematik",
            "tolerance": 0.1,
            "decimals": 2,
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.invalidPayload"));
    }

    #[test]
    fn mathematik_negative_tolerance() {
        let q = json!({
            "question": "What is 2+2?",
            "type": "mathematik",
            "correct": 4.0,
            "tolerance": -0.1,
            "decimals": 2,
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.invalidPayload"));
    }

    #[test]
    fn mathematik_decimals_out_of_range() {
        let q = json!({
            "question": "What is 2+2?",
            "type": "mathematik",
            "correct": 4.0,
            "tolerance": 0.1,
            "decimals": 10,
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.invalidPayload"));
    }

    #[test]
    fn sequencing_valid() {
        let q = json!({
            "question": "Order the steps",
            "type": "sequencing",
            "items": [
                { "id": "item-1", "label": "Boil water" },
                { "id": "item-2", "label": "Add tea bag" },
                { "id": "item-3", "label": "Pour" }
            ],
            "correctOrder": ["item-1", "item-3", "item-2"],
            "cooldown": 5,
            "time": 15
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn sequencing_without_answers_is_not_too_few_answers() {
        // Regression: Sequencing used to fall through to choice default.
        let q = json!({
            "question": "Order the steps",
            "type": "sequencing",
            "items": [
                { "id": "a", "label": "A" },
                { "id": "b", "label": "B" }
            ],
            "correctOrder": ["a", "b"],
            "cooldown": 5,
            "time": 15
        });
        assert_ne!(validate_question(&q), Err("errors:quizz.tooFewAnswers"));
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn sequencing_missing_items() {
        let q = json!({
            "question": "Order the steps",
            "type": "sequencing",
            "correctOrder": ["a", "b"],
            "cooldown": 5,
            "time": 15
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.invalidPayload"));
    }

    #[test]
    fn sequencing_order_id_not_in_items() {
        let q = json!({
            "question": "Order the steps",
            "type": "sequencing",
            "items": [
                { "id": "a", "label": "A" },
                { "id": "b", "label": "B" }
            ],
            "correctOrder": ["a", "c"],
            "cooldown": 5,
            "time": 15
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.invalidPayload"));
    }

    #[test]
    fn word_cloud_valid() {
        let q = json!({
            "question": "Share words about nature",
            "type": "word-cloud",
            "answers": ["tree", "flower"],
            "cooldown": 5,
            "time": 30
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn word_cloud_too_few_answers() {
        let q = json!({
            "question": "Share words about nature",
            "type": "word-cloud",
            "answers": ["tree"],
            "cooldown": 5,
            "time": 30
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.tooFewAnswers"));
    }

    #[test]
    fn word_cloud_no_solution_required() {
        let q = json!({
            "question": "Share words about nature",
            "type": "word-cloud",
            "answers": ["tree", "flower"],
            "cooldown": 5,
            "time": 30
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn brainstorm_valid() {
        let q = json!({
            "question": "Ideas for improvement?",
            "type": "brainstorm",
            "answers": ["fast", "reliable"],
            "cooldown": 5,
            "time": 45
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn brainstorm_too_few_answers() {
        let q = json!({
            "question": "Ideas for improvement?",
            "type": "brainstorm",
            "answers": ["fast"],
            "cooldown": 5,
            "time": 45
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.tooFewAnswers"));
    }

    #[test]
    fn brainstorm_no_solution_required() {
        let q = json!({
            "question": "Ideas for improvement?",
            "type": "brainstorm",
            "answers": ["fast", "reliable"],
            "cooldown": 5,
            "time": 45
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn confidence_valid() {
        let q = json!({
            "question": "Are you confident?",
            "type": "confidence",
            "cooldown": 5,
            "time": 10
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn confidence_permissive() {
        let q = json!({
            "question": "Are you confident?",
            "type": "confidence",
            "cooldown": 5,
            "time": 10
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn micro_lesson_valid() {
        let q = json!({
            "question": "Watch this lesson",
            "type": "micro-lesson",
            "cooldown": 5,
            "time": 60
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn micro_lesson_permissive() {
        let q = json!({
            "question": "Watch this lesson",
            "type": "micro-lesson",
            "cooldown": 5,
            "time": 60
        });
        assert!(validate_question(&q).is_ok());
    }
}
